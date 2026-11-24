<#
.SYNOPSIS
  Builds assets/swf/client_fr_play.swf: client_fr.swf with the chk check bypassed, the replay API
  (pause/speed/progress: PC_PLAY_GAME_*, PC_PLAY_FAST and HELPERS_PLAY in patch-msg.as), plus
  bitmaps 17/19 made transparent ahead of the original's threshold() (patch-play-bitmaps.mjs, data only)
  and the TextField factory's height 14 -> 20 (patch-play-textfields.mjs, one byte).

.DESCRIPTION
  The original refuses its `data` flashvar unless `chk` equals a home-made hash the server
  cannot compute (recon §3.2). The display SWF removes that single branch of Main._rsq
  (PC_PLAY_MAIN in patch-msg.as: the `returnvoid` after `if(hash(data) != chk)` is dropped);
  the replay API hooks and helpers (README "API de lecture"), no trace helpers. Same verified source, same tooling and same
  ffdec -replace P-code path as build.ps1, which this script calls with -Play.
  Output: assets/swf/client_fr_play.swf + client_fr_play.swf.sha256. Pass -Verify to list the
  P-code differences against the original (README "client_fr_play.swf").
#>
param(
  [string]$WorkDir = (Join-Path $PSScriptRoot "..\..\..\..\minitroopers-work\oracle-build-play"),
  [switch]$Verify
)
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "build.ps1") -Play -WorkDir $WorkDir -Verify:$Verify
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
