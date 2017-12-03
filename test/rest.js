const assert = require('chai').assert
const expressMongoRest = require('../index')
const express = require('express')
const mongoskin = require('mongoskin')
const ObjectID = require('mongodb').ObjectID
const http = require('http')
const request = require('supertest')

function createApp (db) {
  const app = express()
  const router = expressMongoRest(db)
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

describe('express-rest-mongo', () => {
  let app;
  let db;

  app = createApp('mongodb://localhost:27017/express-rest-mongo-test')
  db = app.db
  db.bind('users')

  after((done) => {
    db.dropDatabase((err) => { db.close(done) })
  })

  describe('/:collection', () => {
    beforeEach((done) => {
      db.users.remove({}, null, (err) => {
        if (err) throw done(err)
        const list = [{ _id: '0001', name: 'Bob', email: 'bob@example.com' }, { name: 'Judy', email: 'judy@example.com' }]
        db.users.insert(list, null, done)
      })
    })

    describe('GET', () => {
      it('should find all', (done) => {
        request(app).get('/api/v1/users')
          .expect(200)
          .end((err, {text, headers}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.equal(result.length, 2)
            assert.equal(headers['x-total-count'], 2)
            assert.notOk(result[0]._id, 'do not expect _id')
            assert.notOk(result[1]._id, 'do not expect _id')
            assert.ok(result[0].id, 'expect id')
            assert.ok(result[1].id, 'expect id')
            done()
          })
      })
      it('should find by query', (done) => {
        request(app).get('/api/v1/users?name=Bob')
          .expect(200)
          .end((err, {text, headers}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.equal(result.length, 1)
            assert.equal(headers['x-total-count'], 1)
            assert.equal(result[0].name, 'Bob')
            assert.notOk(result[0]._id, 'do not expect _id')
            assert.ok(result[0].id, 'expect id')
            done()
          })
      })
      it('should find none by query', (done) => {
        request(app).get('/api/v1/users?name=None')
          .expect(200)
          .end((err, {text, headers}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.equal(result.length, 0)
            assert.equal(headers['x-total-count'], 0)
            done()
          })
      })
      it('can return an envelope', (done) => {
        request(app).get('/api/v1/users?name=Bob&envelope=true')
          .expect(200)
          .end((err, {text, headers}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.equal(headers['x-total-count'], 1)
            assert.ok(result.users, 'expect envelope')
            assert.equal(result.users.length, 1)
            assert.equal(result.users[0].name, 'Bob')
            assert.notOk(result.users[0]._id, 'do not expect _id')
            assert.ok(result.users[0].id, 'expect id')
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
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.notOk(result._id, 'do not expect _id')
            assert.ok(result.id, 'expect id')
            done()
          })
      })
      it('should fail w/o body', (done) => {
        request(app).post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .expect(400)
          .send()
          .end((err, res) => {
            if (err) return done(err)
            done()
          })
      })
      it('can return an envelope', (done) => {
        request(app).post('/api/v1/users?envelope=true')
          .set('Content-Type', 'application/json')
          .send({ name: 'Carl', email: 'carl@example.com' })
          .expect(201)
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.ok(result.user.id, 'expect id')
            done()
          })
      })
    })

    describe('PUT', () => {
      it('should fail w/o full path', (done) => {
        request(app).put('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send({ name: 'Carl', email: 'carl@example.com' })
          .expect(405)
          .end((err, res) => {
            if (err) return done(err)
            done()
          })
      })
    })

    describe('PATCH', () => {
      it('should fail w/o full path', (done) => {
        request(app).patch('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send([
            { op: 'replace', path: '/name', value: 'Bobby' },
            { op: 'replace', path: '/email', value: 'bobby@example.com' }
          ])
          .expect(405)
          .end((err, res) => {
            if (err) return done(err)
            done()
          })
      })
    })

    describe('DELETE', () => {
      it('should remove all', (done) => {
        db.users.count({}, (e, result) => {
          assert.notEqual(result, 0, 'expect some to exist')
          request(app).delete('/api/v1/users')
            .set('Content-Type', 'application/json')
            .expect(204)
            .end((err, res) => {
              if (err) return done(err)
              db.users.count({}, (e, result) => {
                assert.equal(result, 0)
                done()
              })
            })
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
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.notOk(result._id, 'do not expect _id')
            assert.equal(result.id, '0001')
            assert.equal(result.name, 'Bob')
            done()
          })
      })
      it('should find one by generated id', (done) => {
        db.users.findOne({ name: 'Judy' }, (e, {_id}) => {
          const id = _id
          request(app).get(`/api/v1/users/${id}`)
            .expect(200)
            .end((err, {text}) => {
              if (err) return done(err)
              const result = JSON.parse(text)
              assert.notOk(result._id, 'do not expect _id')
              assert.equal(result.id, id)
              assert.equal(result.name, 'Judy')
              done()
            })
        })
      })
      it('should find none by id', (done) => {
        request(app).get('/api/v1/users/none')
          .expect(404)
          .end((err, res) => {
            if (err) return done(err)
            done()
          })
      })
      it('can return an envelope', (done) => {
        request(app).get('/api/v1/users/0001?envelope=true')
          .expect(200)
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.equal(result.user.id, '0001')
            assert.equal(result.user.name, 'Bob')
            done()
          })
      })
    })

    describe('POST', () => {
      it('should fail w/ full path', (done) => {
        request(app).post('/api/v1/users/0001')
          .set('Content-Type', 'application/json')
          .expect(405)
          .send()
          .end((err, res) => {
            if (err) return done(err)
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
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.equal(result.id, '0001')
            assert.notOk(result._id)
            db.users.findOne({ _id: '0001' }, (e, {name}) => {
              assert.equal(name, 'Bobby')
              done()
            })
          })
      })
      it('should update document by generated id', (done) => {
        db.users.findOne({ name: 'Judy' }, (e, {_id}) => {
          const id = _id
          request(app).put(`/api/v1/users/${id}`)
            .set('Content-Type', 'application/json')
            .send({ name: 'Judith', email: 'judith@example.com' })
            .expect(200)
            .end((err, {text}) => {
              if (err) return done(err)
              const result = JSON.parse(text)
              assert.notOk(result._id, 'do not expect _id')
              assert.equal(result.id, id)
              db.users.findOne({ _id: id }, (e, {name}) => {
                assert.equal(name, 'Judith')
                done()
              })
            })
        })
      })
      it('should create document', (done) => {
        request(app).put('/api/v1/users/0002')
          .set('Content-Type', 'application/json')
          .send({ name: 'Carl', email: 'carl@example.com' })
          .expect(200)
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.notOk(result._id, 'do not expect _id')
            assert.equal(result.id, '0002')
            db.users.findOne({ _id: '0002' }, (e, {name}) => {
              assert.equal(name, 'Carl')
              done()
            })
          })
      })
      it('should fail w/o body', (done) => {
        request(app).put('/api/v1/users/0')
          .set('Content-Type', 'application/json')
          .expect(400)
          .send()
          .end((err, res) => {
            if (err) return done(err)
            done()
          })
      })
      it('can return an envelope', (done) => {
        request(app).put('/api/v1/users/0001?envelope=true')
          .set('Content-Type', 'application/json')
          .send({ name: 'Bobby', email: 'bobby@example.com' })
          .expect(200)
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.ok(result.user, 'expect envelope')
            assert.equal(result.user.id, '0001')
            assert.notOk(result.user._id)
            db.users.findOne({ _id: '0001' }, (e, {name}) => {
              assert.equal(name, 'Bobby')
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
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.notOk(result._id, 'do not expect _id')
            assert.equal(result.id, '0001')
            db.users.findOne({ _id: '0001' }, (e, {name}) => {
              assert.equal(name, 'Bobby')
              done()
            })
          })
      })
      it('can return an envelope', (done) => {
        request(app).patch('/api/v1/users/0001?envelope=true')
          .set('Content-Type', 'application/json')
          .send([
            { op: 'replace', path: '/name', value: 'Bobby' },
            { op: 'replace', path: '/email', value: 'bobby@example.com' }
          ])
          .expect(200)
          .end((err, {text}) => {
            if (err) return done(err)
            const result = JSON.parse(text)
            assert.ok(result.user, 'expect envelope')
            assert.notOk(result.user._id, 'do not expect _id')
            assert.equal(result.user.id, '0001')
            db.users.findOne({ _id: '0001' }, (e, {name}) => {
              assert.equal(name, 'Bobby')
              done()
            })
          })
      })
    })

    describe('DELETE', () => {
      it('should remove document', (done) => {
        db.users.count({ name: 'Bob' }, (e, result) => {
          assert.equal(result, 1, 'expect match to exist')

          request(app).delete('/api/v1/users/0001')
            .set('Content-Type', 'application/json')
            .expect(204)
            .end((err, res) => {
              if (err) return done(err)
              db.users.count({ name: 'Bob' }, (e, result) => {
                assert.equal(result, 0)
                done()
              })
            })
        })
      })

      it('should remove document by generated id', (done) => {
        db.users.findOne({ name: 'Judy' }, (e, {_id}) => {
          const id = _id
          assert.ok(id, 'expect match to exist')
          request(app).delete(`/api/v1/users/${id}`)
            .expect(204)
            .end((err, res) => {
              if (err) return done(err)
              db.users.count({ name: 'Judy' }, (e, result) => {
                assert.equal(result, 0)
                done()
              })
            })
        })
      })
    })
  })
})
