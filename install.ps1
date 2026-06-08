#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required but was not found." -ForegroundColor Red
  Write-Host "Install it from https://nodejs.org and run this again." -ForegroundColor Red
  exit 1
}
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$dir/install.mjs" $args
