# Restore trashed images by removing timestamp prefixes
Get-ChildItem -Name "1761027657-*" | ForEach-Object {
    $newName = $_.Substring($_.IndexOf("-") + 1)
    Rename-Item $_ $newName
    Write-Host "Renamed $_ to $newName"
}

Get-ChildItem -Name "1759671506-*" | ForEach-Object {
    $newName = $_.Substring($_.IndexOf("-") + 1)
    Rename-Item $_ $newName
    Write-Host "Renamed $_ to $newName"
}

Write-Host "All images restored!"

