#!/usr/bin/env node

const express = require('express')
const compress = require('compression')
const methodOverride = require('method-override')
const expressMongodbRest = require('./index')
const https = require('https')
const pem = require('pem')
const fs = require('fs')
const dotenv = require('dotenv')

dotenv.load()

const port = normalizePort(process.env.PORT || '3000')
const db = process.env.DB || 'mongodb://localhost:27017/express-mongo-rest'

// recommended to mitigate against BEAST attack (see https://community.qualys.com/blogs/securitylabs/2011/10/17/mitigating-the-beast-attack-on-tls)
const ciphers = 'ECDHE-RSA-AES128-SHA256:AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH'

try {
  if (process.env.PFX) {
    var options = {
      pfx: fs.readFileSync(process.env.PFX),
      passphrase: process.env.PASSPHRASE,
      ciphers,
      honorCipherOrder: true
    }
    createServer(options, port, db)
  } else if (process.env.KEY || process.env.CERT) {
    if (!process.env.KEY) throw 'CERT defined, but KEY is not'
    if (!process.env.CERT) throw 'KEY defined, but CERT is not'
    var options = {
      key: fs.readFileSync(process.env.KEY),
      cert: fs.readFileSync(process.env.CERT),
      passphrase: process.env.PASSPHRASE,
      ciphers,
      honorCipherOrder: true
    }
    createServer(options, port, db)
  } else {
    pem.createCertificate({ days: 9999, selfSigned: true }, (err, keys) => {
      const options = {
        key: keys.serviceKey,
        cert: keys.certificate,
        ciphers,
        honorCipherOrder: true
      }
      if (err) throw (err)
      createServer(options, port, db)
    })
  }
} catch (err) {
  console.error(err.message || err)
}

function createServer (options, port, db) {
  let app,
    server

  app = express()
  app.use(compress())
  app.use(methodOverride())
  app.use('/api/v1', expressMongodbRest(db))
  app.set('port', port)
  app.set('json spaces', 2)
  app.set('query parser', 'simple')

  server = https.createServer(options, app)
  server.listen(port, () => {
    const addr = server.address()
    const bind = (typeof addr === 'string') ? `pipe ${addr}` : `port ${addr.port}`
    console.info(`Listening on ${bind}`)
  })

  server.on('error', onError)
}

function normalizePort (val) {
  const port = parseInt(val, 10)
  if (isNaN(port)) return val
  return (port >= 0) ? port : false
}

function onError (err) {
  if (err.syscall !== 'listen') throw err

  const bind = (typeof port === 'string') ? `pipe ${port}` : `port ${port}`

  switch (err.code) {
    case 'EACCES':
      console.error(`EACCESS, ${bind} requires elevated privileges`)
      break
    case 'EADDRINUSE':
      console.error(`EADDRINUSE, ${bind} is already in use`)
      break
    default:
      throw err
  }
}
