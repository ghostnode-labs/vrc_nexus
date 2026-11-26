<?php

namespace wcf\system\bbcode;

use wcf\system\vrcnexus\VrcNexusInfo;
use wcf\system\WCF;
use wcf\util\StringUtil;

/**
 * Parses [vrcworld], [vrcavatar] and [vrcgroup]: the ID (or a vrchat.com link) as attribute or content,
 * rendered as an info card. Without an info source only ID and link are shown.
 *
 * @author  GhostNode Labs
 * @license GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 */
final class VrcNexusBBCode extends AbstractBBCode
{
    private const TYPES = [
        'vrcworld' => ['wrld', 'world'],
        'vrcavatar' => ['avtr', 'avatar'],
        'vrcgroup' => ['grp', 'group'],
    ];

    /**
     * @inheritDoc
     */
    public function getParsedTag(array $openingTag, $content, array $closingTag, BBCodeParser $parser): string
    {
        $tag = $openingTag['name'] ?? '';
        if (!isset(self::TYPES[$tag])) {
            return '';
        }
        [$prefix, $kind] = self::TYPES[$tag];

        $raw = StringUtil::decodeHTML(\trim((string)($openingTag['attributes'][0] ?? \strip_tags((string)$content))));
        if (\preg_match('~(' . $prefix . '_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})~i', $raw, $match) !== 1) {
            return StringUtil::encodeHTML($raw);
        }
        $id = \strtolower($match[1]);
        $url = 'https://vrchat.com/home/' . $kind . '/' . $id;

        if ($parser->getOutputType() !== 'text/html') {
            return StringUtil::getAnchorTag($url, $id);
        }

        return WCF::getTPL()->render('wcf', 'vrcNexusCard', [
            'vrcKind' => $kind,
            'vrcID' => $id,
            'vrcURL' => $url,
            'vrcInfo' => VrcNexusInfo::get($kind, $id),
        ]);
    }
}
