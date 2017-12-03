const assert = require('chai').assert
const expressMongoRest = require('../index')
const express = require('express')
const mongoskin = require('mongoskin')
const ObjectID = require('mongodb').ObjectID
const http = require('http')
const request = require('supertest')

function createApp (db, options) {
  const app = express()
  const router = expressMongoRest(db, options)
  app.use('/api/v1', router)
  app.db = router.db

  app.use((err, req, res, next) => {
    if (!err.status) console.error(err)
    res.status(err.status || 500)
    res.setHeader('Content-Type', 'application/json')
    res.send(err)
  })
  return app
}

describe('express-rest-mongo {envelope:true}', () => {
  let app,
    db

  app = createApp('mongodb://localhost:27017/express-rest-mongo-test', { envelope: true })
  db = app.db
  db.bind('users')

  after((done) => {
    db.dropDatabase((err) => { db.close(done) })
  })

  describe('/:collection', () => {
    beforeEach((done) => {
      db.users.remove({}, null, (err) => {
        if (err) return done(err)
        const list = [{ _id: '0001', name: 'Bob', email: 'bob@example.com' }, { name: 'Judy', email: 'judy@example.com' }]
        db.users.insert(list, null, done)
      })
    })

    describe('GET', () => {
      it('should find all', (done) => {
        request(app).get('/api/v1/users')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.users, 'expect envelope')
            assert.equal(res.headers['x-total-count'], 2)
            assert.equal(result.users.length, 2)
            assert.notOk(result.users[0]._id, 'do not expect _id')
            assert.notOk(result.users[1]._id, 'do not expect _id')
            assert.ok(result.users[0].id, 'expect id')
            assert.ok(result.users[1].id, 'expect id')
            done()
          })
      })
      it('should find by query', (done) => {
        request(app).get('/api/v1/users?name=Bob')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.users, 'expect envelope')
            assert.equal(result.users.length, 1)
            assert.equal(res.headers['x-total-count'], 1)
            assert.equal(result.users[0].name, 'Bob')
            assert.notOk(result.users[0]._id, 'do not expect _id')
            assert.ok(result.users[0].id, 'expect id')
            done()
          })
      })
      it('should find none by query', (done) => {
        request(app).get('/api/v1/users?name=None')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.users, 'expect envelope')
            assert.equal(result.users.length, 0)
            assert.equal(res.headers['x-total-count'], 0)
            done()
          })
      })
      it('can return no envelope', (done) => {
        request(app).get('/api/v1/users?name=Bob&envelope=false')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.notOk(result.users, 'expect no envelope')
            assert.equal(result.length, 1)
            assert.equal(res.headers['x-total-count'], 1)
            assert.equal(result[0].name, 'Bob')
            assert.notOk(result[0]._id, 'do not expect _id')
            assert.ok(result[0].id, 'expect id')
            done()
          })
      })
    })

    describe('POST', () => {
      it('should create document', (done) => {
        request(app).post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send({ name: 'Carl', email: 'carl@example.com' })
          .expect(201)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.ok(result.user.id, 'expect id')
            done()
          })
      })
      it('can return no envelope', (done) => {
        request(app).post('/api/v1/users?envelope=false')
          .set('Content-Type', 'application/json')
          .send({ name: 'Carl', email: 'carl@example.com' })
          .expect(201)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.notOk(result.user, 'expect no envelope')
            assert.notOk(result._id, 'do not expect _id')
            assert.ok(result.id, 'expect id')
            done()
          })
      })
    })
  })

  describe('/:collection/:id', () => {
    beforeEach((done) => {
      db.users.remove({}, null, () => {
        const list = [{ _id: '0001', name: 'Bob', email: 'bob@example.com' }, { name: 'Judy', email: 'judy@example.com' }]
        db.users.insert(list, null, done)
      })
    })

    describe('GET', () => {
      it('should find one', (done) => {
        request(app).get('/api/v1/users/0001')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.equal(result.user.id, '0001')
            assert.equal(result.user.name, 'Bob')
            done()
          })
      })
      it('can return no envelope', (done) => {
        request(app).get('/api/v1/users/0001?envelope=false')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.notOk(result.user, 'expect no envelope')
            assert.notOk(result._id, 'do not expect _id')
            assert.equal(result.id, '0001')
            assert.equal(result.name, 'Bob')
            done()
          })
      })
    })

    describe('PUT', () => {
      it('should update document', (done) => {
        request(app).put('/api/v1/users/0001')
          .set('Content-Type', 'application/json')
          .send({ name: 'Bobby', email: 'bobby@example.com' })
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.user, 'expect envelope')
            assert.equal(result.user.id, '0001')
            assert.notOk(result.user._id)
            db.users.findOne({ _id: '0001' }, (e, result) => {
              assert.equal(result.name, 'Bobby')
              done()
            })
          })
      })
      it('should create document', (done) => {
        request(app).put('/api/v1/users/0002')
          .set('Content-Type', 'application/json')
          .send({ name: 'Carl', email: 'carl@example.com' })
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.equal(result.user.id, '0002')
            db.users.findOne({ _id: '0002' }, (e, result) => {
              assert.equal(result.name, 'Carl')
              done()
            })
          })
      })
      it('can return no envelope', (done) => {
        request(app).put('/api/v1/users/0001?envelope=false')
          .set('Content-Type', 'application/json')
          .send({ name: 'Bobby', email: 'bobby@example.com' })
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.notOk(result.user, 'expect no envelope')
            assert.equal(result.id, '0001')
            assert.notOk(result._id)
            db.users.findOne({ _id: '0001' }, (e, result) => {
              assert.equal(result.name, 'Bobby')
              done()
            })
          })
      })
    })

    describe('PATCH', () => {
      it('should update document', (done) => {
        request(app).patch('/api/v1/users/0001')
          .set('Content-Type', 'application/json')
          .send([
            { op: 'replace', path: '/name', value: 'Bobby' },
            { op: 'replace', path: '/email', value: 'bobby@example.com' }
          ])
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.equal(result.user.id, '0001')
            db.users.findOne({ _id: '0001' }, (e, result) => {
              assert.equal(result.name, 'Bobby')
              done()
            })
          })
      })
      it('can return no envelope', (done) => {
        request(app).patch('/api/v1/users/0001?envelope=false')
          .set('Content-Type', 'application/json')
          .send([
            { op: 'replace', path: '/name', value: 'Bobby' },
            { op: 'replace', path: '/email', value: 'bobby@example.com' }
          ])
          .expect(200)
          .end((err, res) => {
            if (err) return done(err)
            const result = JSON.parse(res.text)
            assert.notOk(result.user, 'expect no envelope')
            assert.notOk(result._id, 'do not expect _id')
            assert.equal(result.id, '0001')
            db.users.findOne({ _id: '0001' }, (e, result) => {
              assert.equal(result.name, 'Bobby')
              done()
            })
          })
      })
    })
  })
})
