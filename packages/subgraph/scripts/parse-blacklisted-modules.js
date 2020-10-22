#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const network = process.argv[2]
const blacklistedModules = require('../blacklisted-modules')[network] || []

console.log(`Blacklisting modules: ${blacklistedModules}`)
const outputPath = path.join(process.cwd(), 'helpers/blacklisted-modules.ts')
if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

const file = `// This file was autogenerated at deployment time picking the list of blacklisted modules defined in "blacklisted-modules.js" for network ${network}


export const BLACKLISTED_MODULES: string[] = [${blacklistedModules.map(x => `"${x.toLowerCase()}"`).join(', ')}]
`
fs.writeFileSync(outputPath, `${file}`)
