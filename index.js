const express = require('express');
const mongoskin = require('mongoskin');
const ObjectID = require('mongodb').ObjectID;
const patch2m = require('jsonpatch-to-mongodb');
const query2m = require('query-to-mongo');
const bodyParser = require('body-parser');
const inflector = require('inflection');

module.exports = function expressMongodbRest(db, options) {
  let router;

  if (!db) throw new TypeError('db required')
  if (typeof db === 'string') db = mongoskin.db(db, {safe: true})
  options = options || {}

  router = express.Router()
  router.db = db

  router.use(bodyParser.json())
  router.use((req, res, next) => {
    req.db = router.db
    res.envelope = options.envelope
    next()
  })

  if (options.validator) router.use(options.validator)

  const auth = options.auth || ((req, res, next) => next())

  addRestMethods(router, options.singularize || inflector.singularize, auth)
  router.use('/:collection', auth, convertId)
  router.use('/:collection', auth, envelope)
  router.use('/:collection', auth, sendJson)
  return router
}

function isEmpty(obj) {
  if (obj == null || obj.length === 0) return true
  if (obj.length > 0) return false
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) return false
  }
  return true
}

function fullUrl(req) {
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

function normalizeId(id) {
  if (ObjectID.isValid(id)) return new ObjectID(id)
  return id;
}

function addRestMethods(router, singularize, auth) {
  router.param('collection', function collectionParam(req, res, next, collection) {
    res.locals.plural = collection
    res.locals.singular = singularize(collection)
    req.collection = req.db.collection(res.locals.plural)
    next()
  })

  router.param('id', (req, res, next, id) => {
    req.idMatch = { _id: normalizeId(id) }
    next()
  })

  router.get('/:collection', auth, (req, res, next) => {
    const query = query2m(req.query, { ignore: 'envelope' });

    req.collection.count(query.criteria, (e, count) => {
      let links;
      if (e) return next(e)
      res.append('X-Total-Count', count)
      links = query.links(fullUrl(req), count)
      if (links) res.links(links)
      req.collection.find(query.criteria, query.options).toArray((e, results) => {
        if (e) return next(e)
        res.locals.json = results
        next()
      })
    })
  })

  router.post('/:collection', auth, (req, res, next) => {
    if (!req.body || isEmpty(req.body)) throw { status: 400, message: 'No Request Body' } // Bad Request
    req.collection.insert(req.body, (e, {ops}) => {
      if (e) return next(e)
      res.append('Location', `${fullUrl(req)}/${ops[0]._id}`)
      res.status(201) // Created
      res.locals.json = ops[0]
      next()
    })
  })

  router.put('/:collection', auth, (req, res, next) => {
    // TODO: bulk update?
    res.status(405).send() // Method Not Allowed
  })

  router.patch('/:collection', auth, (req, res, next) => {
    res.status(405).send() // Method Not Allowed
  })

  router.delete('/:collection', auth, ({collection}, res, next) => {
    collection.remove({}, null, (e, result) => {
      if (e) return next(e)
      res.status(204).send() // No Content
    })
  })

  router.get('/:collection/:id', auth, ({collection, idMatch}, res, next) => {
    collection.findOne(idMatch, (e, result) => {
      if (e) return next(e)
      if (!result) res.status(404) // Not Found
      res.locals.json = result
      next()
    })
  })

  router.post('/:collection/:id', auth, (req, res, next) => {
    res.status(405).send() // Method Not Allowed
  })

  router.put('/:collection/:id', auth, ({body, params, collection, idMatch}, {locals}, next) => {
    if (!body || isEmpty(body)) throw { status: 400, message: 'No Request Body' } // Bad Request
    body._id = normalizeId(params.id)
    collection.update(idMatch, body, { upsert: true }, (e, result) => {
      if (e) return next(e)
      // mongodb's update with $set/$unset doesn't error if there's no match
      // and doesn't return a result upon success; but a findOne after will
      collection.findOne(idMatch, (e, result) => {
        if (e) return next(e)
        locals.json = result
        next()
      })
    })
  })

  router.patch('/:collection/:id', auth, ({body, collection, idMatch}, {locals}, next) => {
    if (!body || isEmpty(body)) throw { status: 400, message: 'No Request Body' } // Bad Request
    collection.update(idMatch, patch2m(body), (e, result) => {
      if (e) return next(e)
      // mongodb's update with $set/$unset doesn't error if there's no match
      // and doesn't return a result upon success; but a findOne after will
      collection.findOne(idMatch, (e, result) => {
        if (e) return next(e)
        locals.json = result
        next()
      })
    })
  })

  router.delete('/:collection/:id', auth, ({collection, idMatch}, res, next) => {
    collection.remove(idMatch, { single: true }, (e, result) => {
      if (e) return next(e)
      res.status(204).send(); // No Content
    })
  })

  // TODO: sub-resources (ie., get/post on /:collection/:id/resource)

  return router
}

function convertId(req, {locals}, next) {
  if (locals.json instanceof Array) {
    locals.json.forEach(renameIdKey)
  } else if (locals.json) {
    renameIdKey(locals.json)
  }
  next()
}

function renameIdKey(obj) {
  if (obj) {
    obj.id = obj._id
    delete obj._id
  }
  return obj
}

function isToggled(value, override) {
  return (override && override === String(!value))
}

function envelope({query}, res, next) {
  let useEnvelope = res.envelope;
  if (isToggled(useEnvelope, query['envelope'])) useEnvelope = !useEnvelope

  if (useEnvelope && res.locals.json) {
    const envelope = {};
    let type = res.locals.singular;
    if (res.locals.json instanceof Array) type = res.locals.plural
    envelope[type] = res.locals.json
    res.locals.json = envelope
  }
  next()
}

function sendJson(req, res, next) {
  if (res.locals.json) res.send(res.locals.json)
  else next()
}
