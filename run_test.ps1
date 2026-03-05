$env:HEADLESS = 'false'
Set-Location 'test\e2e'
node gridforge-comprehensive.test.cjs
