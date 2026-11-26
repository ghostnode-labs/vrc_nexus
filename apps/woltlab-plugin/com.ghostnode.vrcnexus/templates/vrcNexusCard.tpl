<div class="vrcNexusCard" style="display:flex;gap:12px;align-items:stretch;max-width:560px;margin:8px 0;border:1px solid var(--wcfContentBorderInner);border-radius:8px;overflow:hidden;background:var(--wcfContentBackground)">
	{if $vrcInfo[image]|isset}<a href="{$vrcURL}" target="_blank" rel="noopener noreferrer nofollow" style="flex:0 0 160px"><img src="{$vrcInfo[image]}" alt="" loading="lazy" style="display:block;width:160px;height:100%;min-height:90px;object-fit:cover"></a>{/if}
	<div style="padding:10px 12px;min-width:0;flex:1">
		<div style="font-size:12px;opacity:.7">{if $vrcKind == 'world'}🌐 {lang}wcf.vrcnexus.kind.world{/lang}{elseif $vrcKind == 'avatar'}🎭 {lang}wcf.vrcnexus.kind.avatar{/lang}{else}👥 {lang}wcf.vrcnexus.kind.group{/lang}{/if}</div>
		<div style="font-weight:600;margin:2px 0"><a href="{$vrcURL}" target="_blank" rel="noopener noreferrer nofollow">{if $vrcInfo[name]|isset}{$vrcInfo[name]}{else}{$vrcID}{/if}</a></div>
		{if $vrcInfo[author]|isset}<div style="font-size:13px">{lang}wcf.vrcnexus.by{/lang} {$vrcInfo[author]}</div>{/if}
		{if $vrcInfo[description]|isset}<div style="font-size:13px;opacity:.85;margin-top:4px">{$vrcInfo[description]}</div>{/if}
		<div style="font-size:12px;opacity:.7;margin-top:6px">
			{if $vrcInfo[capacity]|isset}👥 {#$vrcInfo[capacity]} · {/if}{if $vrcInfo[visits]|isset}👣 {#$vrcInfo[visits]} · {/if}{if $vrcInfo[favorites]|isset}⭐ {#$vrcInfo[favorites]} · {/if}{if $vrcInfo[members]|isset}🧑‍🤝‍🧑 {#$vrcInfo[members]} · {/if}
			<a href="{$vrcURL}" target="_blank" rel="noopener noreferrer nofollow">{lang}wcf.vrcnexus.open{/lang} ↗</a>
		</div>
	</div>
</div>
