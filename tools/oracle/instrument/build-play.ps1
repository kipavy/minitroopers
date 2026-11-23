<#
.SYNOPSIS
  Builds assets/swf/client_fr_play.swf: client_fr.swf with ONLY the chk check bypassed, plus
  bitmaps 17/19 made transparent ahead of the original's threshold() (patch-play-bitmaps.mjs, data only).

.DESCRIPTION
  The original refuses its `data` flashvar unless `chk` equals a home-made hash the server
  cannot compute (recon §3.2). The display SWF removes that single branch of Main._rsq
  (PC_PLAY_MAIN in patch-msg.as: the `returnvoid` after `if(hash(data) != chk)` is dropped);
  no trace helpers, no other change. Same verified source, same tooling and same
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
