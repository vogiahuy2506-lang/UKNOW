# UKNOW policy: khong dung Co-authored-by trong commit message.
param([string]$CommitMsgFile)

if (-not (Test-Path $CommitMsgFile)) { exit 0 }

$content = Get-Content $CommitMsgFile -Raw
$clean = $content -replace '(?m)^[Cc][Oo]-[Aa]uthored-[Bb][Yy]:.*\r?\n?', ''
$clean = $clean.TrimEnd()

[System.IO.File]::WriteAllText($CommitMsgFile, $clean, [System.Text.Encoding]::UTF8)
