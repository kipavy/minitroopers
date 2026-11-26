<#
.SYNOPSIS
  Builds assets/oracle/client_fr_trace.swf from assets/swf/client_fr.swf (see README.md).

.DESCRIPTION
  1. checks the SHA-256 of client_fr.swf against assets/swf/SHA256SUMS;
  2. decompiles it with JPEXS FFDec (portable, tools/bin/ffdec) into -WorkDir (outside the
     repo): AS3 sources (with method body ids) + P-code;
  3. inserts the PC_* sections of patch-msg.as into the P-code of Trooper.init, of the
     Game ENTER_FRAME handler and of Main._rsq, and replaces those 3 method bodies
     (`ffdec -replace`, P-code: no original code is recompiled from AS3);
  4. adds the HELPERS section as static methods of the empty class §(m]a\x02§ and
     recompiles that class only (`ffdec -importScript`; -Play: HELPERS_PLAY and the PC_PLAY_* edits);
  5. writes assets/oracle/client_fr_trace.swf and client_fr_trace.swf.sha256.
  With -Verify, also exports the P-code of the result and lists the files whose P-code
  differs from the original (README "Innocuité").

  Nothing is installed: Java is the portable JDK in tools/bin/jdk, and APPDATA is
  redirected to tools/bin/ffdec-home for the FFDec child process only (FFDec writes its
  logs under %APPDATA%\JPEXS).
#>
param(
  # outside the repo: decompiled Motion-Twin code must never be committed
  [string]$WorkDir = (Join-Path $PSScriptRoot "..\..\..\..\minitroopers-work\oracle-build"),
  [switch]$Verify,
  # build assets/swf/client_fr_play.swf instead (see build-play.ps1): the chk check removed,
  # the replay API (PC_PLAY_GAME_*, PC_PLAY_FAST, HELPERS_PLAY), no trace helpers
  [switch]$Play
)
$ErrorActionPreference = "Stop"
$WorkDir = [IO.Path]::GetFullPath($WorkDir)

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Java = Join-Path $Root "tools\bin\jdk\bin\java.exe"
$FFDec = Join-Path $Root "tools\bin\ffdec\ffdec-cli.jar"
$FFHome = Join-Path $Root "tools\bin\ffdec-home"
$Src = Join-Path $Root "assets\swf\client_fr.swf"
$OutDir = Join-Path $Root "assets\oracle"
if ($Play) { $OutDir = Join-Path $Root "assets\swf"; $OutName = "client_fr_play.swf" } else { $OutName = "client_fr_trace.swf" }
$Out = Join-Path $OutDir $OutName
$Patch = Join-Path $PSScriptRoot "patch-msg.as"
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$S = [string][char]0xA7          # the § quoting obfuscated identifiers
$DEL = [string][char]0x7f        # FFDec prints raw U+007F inside some identifiers; spelled {DEL} here

foreach ($p in @($Java, $FFDec, $Src, $Patch)) {
  if (-not (Test-Path $p)) { throw "missing: $p (see tools/oracle/instrument/README.md, section Outils)" }
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Invoke-FFDec([string[]]$FFArgs) {
  New-Item -ItemType Directory -Force $FFHome | Out-Null
  $old = $env:APPDATA
  $env:APPDATA = $FFHome   # process-local; restored below
  try {
    & $Java "-Xmx2g" "-jar" $FFDec @FFArgs | Where-Object { $_ -notmatch "^Exported script" } | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "ffdec failed ($LASTEXITCODE): $($FFArgs -join ' ')" }
  } finally {
    $env:APPDATA = $old
  }
}

function Read-Text([string]$Path) { return [IO.File]::ReadAllText($Path, $Utf8).Replace("`r`n", "`n") }

function Find-Once([string]$Text, [string]$Anchor, [string]$What) {
  $i = $Text.IndexOf($Anchor, [StringComparison]::Ordinal)
  if ($i -lt 0 -or $Text.IndexOf($Anchor, $i + 1, [StringComparison]::Ordinal) -ge 0) {
    throw "anchor for $What not found exactly once"
  }
  return $i
}

# 1. source integrity
$expected = ((Get-Content (Join-Path $Root "assets\swf\SHA256SUMS") | Where-Object { $_ -match "client_fr\.swf$" }) -split "\s+")[0]
$actual = Get-Sha256 $Src
if ($expected -ne $actual) { throw "client_fr.swf SHA-256 mismatch: $actual (expected $expected)" }

# 2. decompile (AS3 with method body ids, and P-code)
$Decomp = Join-Path $WorkDir "decomp"
$PcOrig = Join-Path $WorkDir "pcode-orig"
$Import = Join-Path $WorkDir "import"
$Step1 = Join-Path $WorkDir "step1.swf"
if (Test-Path $WorkDir) { Remove-Item -Recurse -Force -LiteralPath $WorkDir }
New-Item -ItemType Directory -Force $Decomp, $Import | Out-Null
Invoke-FFDec @("-config", "showMethodBodyId=true", "-export", "script", $Decomp, $Src)
Invoke-FFDec @("-format", "script:pcode", "-export", "script", $PcOrig, $Src)

# patch-msg.as sections
$sections = @{}
$current = $null
foreach ($line in [IO.File]::ReadAllLines($Patch, $Utf8)) {
  if ($line -match "^//@@ (\w+)") {
    $current = $Matches[1]
    if ($current -ne "END") { $sections[$current] = New-Object System.Collections.Generic.List[string] }
    continue
  }
  if ($current -and $current -ne "END") { $sections[$current].Add($line) }
}
function Get-Section([string]$Name) { return (($sections[$Name] -join "`n") + "`n").Replace("{DEL}", $DEL) }

# 3. P-code insertions into original methods (no AS3 recompilation of original code)
#    class = script name as FFDec prints it; rel = export path (without extension);
#    sig = AS3 signature line (to read the method body index FFDec prints below it);
#    trait = P-code trait line of the method.
$pcodeEdits = @(
  @{ name = "PC_TROOPER"; class = "${S}P!L/\x02${S}.${S}59=F\x03${S}"
     rel = "scripts\${S}P!L%2F%5Cx02${S}\${S}59=F%5Cx03${S}"
     sig = "      public function ${S}(\x07\x184${S}(param1:${S}\x0b\x0eNO${S}) : void"
     trait = 'trait method QName(PackageNamespace(""),"(\x07\x184")' },
  @{ name = "PC_GAME"; class = "${S}Q\btf${S}"
     rel = "scripts\${S}Q%5Cbtf${S}"
     sig = "      public function ${S}&l\f[\x01${S}(param1:*) : void"
     trait = 'trait method QName(PackageNamespace(""),"&l\f[\x01")' },
  @{ name = "PC_MAIN"; class = "${S},7u\x1f${S}"
     rel = "scripts\${S},7u%5Cx1f${S}"
     sig = "      public static function _rsq() : void"
     trait = 'trait method QName(PackageNamespace(""),"_rsq")' }
)
if ($Play) {
  # the chk branch of Main._rsq, and the replay API hooks of the Game (own FIND/REPLACE sections);
  # `parts` = several FIND/REPLACE pairs applied to the same method body
  $game = $pcodeEdits | Where-Object { $_.name -eq "PC_GAME" }
  $main = $pcodeEdits | Where-Object { $_.name -eq "PC_MAIN" }
  $pcodeEdits = @(
    @{ name = "PC_PLAY_MAIN"; class = $main.class; rel = $main.rel; sig = $main.sig; trait = $main.trait },
    @{ name = "PC_PLAY_GAME"; parts = @("PC_PLAY_GAME_INIT", "PC_PLAY_GAME_FRAME", "PC_PLAY_KF", "PC_PLAY_KF_STACK")
       class = $game.class; rel = $game.rel; sig = $game.sig; trait = $game.trait },
    @{ name = "PC_PLAY_FAST"; class = $game.class; rel = $game.rel
       sig = "      public function ${S}Bl{K\x01${S}() : Boolean"
       trait = 'trait method QName(PackageNamespace(""),"Bl{K\x01")' },
    @{ name = "PC_PLAY_TICK"; class = $game.class; rel = $game.rel
       sig = "      public function ${S}&~\x03'${S}() : void"
       trait = 'trait method QName(PackageNamespace(""),"&~\x03\''")' },
    # sounds (mtSfx): Game.apply, the display trooper's hit and death, the map's blast
    @{ name = "PC_PLAY_SFX_APPLY"; class = $game.class; rel = $game.rel
       sig = "      public function apply(param1:Object, param2:Array) : void"
       trait = 'trait method QName(PackageNamespace(""),"apply")' },
    @{ name = "PC_PLAY_SFX_HIT"; class = "${S}59=F\x03${S}"; rel = "scripts\${S}59=F%5Cx03${S}"
       sig = "      public function ${S}3\x19/\x01${S}(param1:Object, param2:Object = undefined) : void"
       trait = 'trait method QName(PackageNamespace(""),"3\x19/\x01")' },
    @{ name = "PC_PLAY_SFX_DIE"; class = "${S}59=F\x03${S}"; rel = "scripts\${S}59=F%5Cx03${S}"
       sig = "      public function ${S}\x16mf\x01${S}() : void"
       trait = 'trait method QName(PackageNamespace(""),"\x16mf\x01")' },
    @{ name = "PC_PLAY_SFX_BLAST"; class = "${S}n#\x07\f${S}"; rel = "scripts\${S}n#%5Cx07%5Cf${S}"
       sig = "      public function ${S}nEI(\x01${S}(param1:Number, param2:Number, param3:int = 50, param4:int = 10, param5:Number = 0.1, param6:Number = 0.2, param7:Object = undefined) : void"
       trait = 'trait method QName(PackageNamespace(""),"nEI(\x01")' },
    # sounds, round 2: a display trooper's animation, a display move's frame, a grenade's release and detonation
    @{ name = "PC_PLAY_SFX_ANIM"; class = "${S}59=F\x03${S}"; rel = "scripts\${S}59=F%5Cx03${S}"
       sig = "      public function ${S}PNcV\x01${S}(param1:${S}/U3W${S}) : void"
       trait = 'trait method QName(PackageNamespace(""),"PNcV\x01")' },
    @{ name = "PC_PLAY_SFX_MOVE"; class = "${S}${DEL}\f\x01${S}.${S}Z\b4]${S}"; rel = "scripts\${S}${DEL}%5Cf%5Cx01${S}\${S}Z%5Cb4]${S}"
       sig = "      override public function ${S}&l\f[\x01${S}() : void"
       trait = 'trait method QName(PackageNamespace(""),"&l\f[\x01")' },
    @{ name = "PC_PLAY_SFX_THROW"; class = "${S}I&\x01${S}.${S}(qs[${S}"; rel = "scripts\${S}I&%5Cx01${S}\${S}(qs[${S}"
       sig = "      public function ${S}87 9${S}() : void"
       trait = 'trait method QName(PackageNamespace(""),"87 9")' },
    @{ name = "PC_PLAY_SFX_DETONATE"; class = "${S}I&\x01${S}.${S}(qs[${S}"; rel = "scripts\${S}I&%5Cx01${S}\${S}(qs[${S}"
       sig = "      public function OX2i() : void"
       trait = 'trait method QName(PackageNamespace(""),"OX2i")' },
    # touch screens: the pause sheet's tooltips on a tap (README "Infobulles au toucher")
    @{ name = "PC_PLAY_TIP_SHOW"; class = "${S}^\x05\x01!${S}.${S}xy\x04\x06${S}"; rel = "scripts\${S}^%5Cx05%5Cx01!${S}\${S}xy%5Cx04%5Cx06${S}"
       sig = "      public function ${S}\x14;T\x07${S}(param1:String, param2:Object = undefined, param3:int = 0) : void"
       trait = 'trait method QName(PackageNamespace(""),"\x14;T\x07")' },
    @{ name = "PC_PLAY_TIP_HIDE"; class = "${S}^\x05\x01!${S}.${S}xy\x04\x06${S}"; rel = "scripts\${S}^%5Cx05%5Cx01!${S}\${S}xy%5Cx04%5Cx06${S}"
       sig = "      public function ${S}\x07MJ\x1f${S}() : void"
       trait = 'trait method QName(PackageNamespace(""),"\x07MJ\x1f")' }
  )
}
$argLines = New-Object System.Collections.Generic.List[string]
foreach ($e in $pcodeEdits) {
  $as = Read-Text (Join-Path $Decomp "$($e.rel).as")
  $sig = "$($e.sig)`n      {`n         // method body index: "
  $i = (Find-Once $as $sig "$($e.name) signature") + $sig.Length
  $bodyIndex = [int]($as.Substring($i, $as.IndexOf(" ", $i) - $i))
  $pc = (Read-Text (Join-Path $PcOrig "$($e.rel).pcode")).Split("`n") | ForEach-Object { $_.Trim() }
  $trait = [Array]::IndexOf($pc, $e.trait)
  if ($trait -lt 0 -or [Array]::LastIndexOf($pc, $e.trait) -ne $trait) { throw "$($e.name): trait not found exactly once" }
  $mStart = $trait; while ($pc[$mStart] -ne "method") { $mStart++ }
  $mEnd = $mStart; while ($pc[$mEnd] -ne "end ; method") { $mEnd++ }
  $method = (($pc[$mStart..$mEnd]) -join "`n") + "`n"
  foreach ($part in $(if ($e.parts) { $e.parts } else { @($e.name) })) {
    $find = Get-Section "${part}_FIND"
    $at = Find-Once $method $find "${part}_FIND"
    $method = $method.Remove($at, $find.Length).Insert($at, (Get-Section "${part}_REPLACE"))
  }
  $file = Join-Path $WorkDir "$($e.name).pcode"
  [IO.File]::WriteAllText($file, $method, $Utf8)
  $argLines.Add($e.class); $argLines.Add($file); $argLines.Add([string]$bodyIndex)
  Write-Host "$($e.name): method body index $bodyIndex"
}
$argsFile = Join-Path $WorkDir "replace-args.txt"
[IO.File]::WriteAllText($argsFile, (($argLines -join "`n") + "`n"), $Utf8)
New-Item -ItemType Directory -Force $OutDir | Out-Null
Invoke-FFDec @("-replace", $Src, $Step1, $argsFile)

# 4. helpers: static methods added to the empty class §(m]a\x02§, recompiled from AS3
#    (trace: HELPERS_IMPORTS + HELPERS; -Play: HELPERS_PLAY_IMPORTS + HELPERS_PLAY, the replay API)
$hSec = if ($Play) { "HELPERS_PLAY" } else { "HELPERS" }
$hRel = "scripts\${S}(m]a%5Cx02${S}.as"
$h = Read-Text (Join-Path $Decomp $hRel)
$pkg = "package`n{`n"
$at = Find-Once $h $pkg "${hSec}_IMPORTS"
$h = $h.Insert($at + $pkg.Length, (Get-Section "${hSec}_IMPORTS"))
$ctor = "      public function ${S}(m]a\x02${S}()`n"
$at = Find-Once $h $ctor $hSec
$h = $h.Insert($at, (Get-Section $hSec))
$dst = Join-Path $Import $hRel
New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
[IO.File]::WriteAllText($dst, $h, $Utf8)
New-Item -ItemType Directory -Force $OutDir | Out-Null
Invoke-FFDec @("-importScript", $Step1, $Out, $Import)
# 4b. -Play only: bitmaps 17/19 made transparent ahead of the original's threshold() (Ruffle a111ceec draws them
#     white; README "client_fr_play.swf"). Bitmap data only, no code.
if ($Play) {
  & node (Join-Path $PSScriptRoot "patch-play-bitmaps.mjs") $Out $Out
  if ($LASTEXITCODE -ne 0) { throw "patch-play-bitmaps.mjs failed" }
  # 4c. the TextField factory's `pushbyte 14` (height) becomes 20: Ruffle masks a field's first line to its height,
  #     Flash let it overflow (README "client_fr_play.swf", "Champs de texte"). One byte of the DoABC tag.
  & node (Join-Path $PSScriptRoot "patch-play-textfields.mjs") $Out $Out
  if ($LASTEXITCODE -ne 0) { throw "patch-play-textfields.mjs failed" }
}

# 5. hash
$hash = Get-Sha256 $Out
[IO.File]::WriteAllText("$Out.sha256", "$hash  $OutName`n", $Utf8)
Write-Host "$OutName sha256=$hash"

if ($Verify) {
  $PcNew = Join-Path $WorkDir "pcode-new"
  Invoke-FFDec @("-format", "script:pcode", "-export", "script", $PcNew, $Out)
  $a = @(Get-ChildItem -Recurse -File $PcOrig | ForEach-Object { $_.FullName.Substring($PcOrig.Length) })
  $b = @(Get-ChildItem -Recurse -File $PcNew | ForEach-Object { $_.FullName.Substring($PcNew.Length) })
  Compare-Object $a $b | ForEach-Object { Write-Host "ONLY-IN-$(if ($_.SideIndicator -eq "<=") {"ORIGINAL"} else {"RESULT"}) $($_.InputObject)" }
  # method indices are renumbered when the helper class grows: ignore `newfunction <N>` operands
  $norm = { param($p) (Read-Text $p) -replace "newfunction \d+", "newfunction #" }
  $raw = 0; $real = 0
  foreach ($rel in $a) {
    $fa = Join-Path $PcOrig $rel; $fb = Join-Path $PcNew $rel
    if (-not (Test-Path -LiteralPath $fb) -or (Get-Sha256 $fa) -eq (Get-Sha256 $fb)) { continue }
    $raw++
    if ((& $norm $fa) -ne (& $norm $fb)) { $real++; Write-Host "DIFF $rel" }
  }
  Write-Host "P-code files differing: $raw raw, $real after ignoring 'newfunction N' renumbering"
  Write-Host "P-code of original: $PcOrig ; of result: $PcNew (diff -r them for details)"
}
