<?php

namespace wcf\system\vrcnexus;

use wcf\system\io\HttpFactory;

/**
 * Optional details (name, author, image …) for VRChat IDs from an info source configured in the ACP
 * (option „vrcnexus_info_url“, HTTPS only). Answers are cached as files; on errors the card simply stays minimal.
 *
 * Expected response of GET <url>?kind=world|avatar|group&id=<id>:
 *   { "name": "…", "author": "…", "image": "https://…", "description": "…", "capacity": 32, "visits": 1234, "favorites": 56, "members": 0 }
 *
 * @author  GhostNode Labs
 * @license GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 */
final class VrcNexusInfo
{
    /**
     * @return array<string, string|int>
     */
    public static function get(string $kind, string $id): array
    {
        $base = \defined('VRCNEXUS_INFO_URL') ? \trim((string)VRCNEXUS_INFO_URL) : '';
        if ($base === '' || !\str_starts_with($base, 'https://')) {
            return [];
        }
        $ttl = \max(5, (int)(\defined('VRCNEXUS_CACHE_MINUTES') ? VRCNEXUS_CACHE_MINUTES : 60)) * 60;
        $file = WCF_DIR . 'cache/vrcnexus_' . \sha1($kind . '|' . $id . '|' . $base) . '.json';
        if (\is_file($file) && \filemtime($file) > \time() - $ttl) {
            $cached = \json_decode((string)\file_get_contents($file), true);

            return \is_array($cached) ? $cached : [];
        }

        $data = [];
        try {
            $client = HttpFactory::makeClientWithTimeout(4);
            $response = $client->request('GET', $base . (\str_contains($base, '?') ? '&' : '?') . \http_build_query(['kind' => $kind, 'id' => $id]));
            if ($response->getStatusCode() === 200) {
                $json = \json_decode((string)$response->getBody(), true);
                if (\is_array($json)) {
                    $data = self::clean($json);
                }
            }
        } catch (\Throwable $e) {
            // Quelle nicht erreichbar: kurze Karte ohne Details
        }
        @\file_put_contents($file, \json_encode($data), \LOCK_EX);

        return $data;
    }

    /**
     * @param array<mixed> $json
     * @return array<string, string|int>
     */
    private static function clean(array $json): array
    {
        $text = static fn ($v, int $max): string => \mb_substr(\trim(\preg_replace('/\s+/u', ' ', (string)$v) ?? ''), 0, $max);
        $out = [];
        foreach (['name' => 120, 'author' => 60, 'description' => 300] as $key => $max) {
            if (isset($json[$key]) && \is_scalar($json[$key]) && $text($json[$key], $max) !== '') {
                $out[$key] = $text($json[$key], $max);
            }
        }
        if (isset($json['image']) && \is_string($json['image']) && \preg_match('~^https://[^\s"\'<>]{4,500}$~', $json['image'])) {
            $out['image'] = $json['image'];
        }
        foreach (['capacity', 'visits', 'favorites', 'members'] as $key) {
            if (isset($json[$key]) && \is_numeric($json[$key]) && (int)$json[$key] > 0) {
                $out[$key] = (int)$json[$key];
            }
        }

        return $out;
    }
}
