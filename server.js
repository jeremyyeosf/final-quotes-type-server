require('dotenv').config();
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const jwt = require('jsonwebtoken')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const mysql = require('mysql2/promise')

const pool = mysql.createPool({
    host: process.env.MYSQL_SERVER,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    connectionLimit: process.env.MYSQL_CONNECTION,
    timezone: '+08:00'
})
const makeQuery = (sql, pool) =>  {
    return (async (args) => {
        const conn = await pool.getConnection();
        try {
            let results = await conn.query(sql, args || []);
            if (results[0].length == 0) {
                throw new Error
            } else {return results[0]}
        }catch(err){
            console.log('no results from SQL', err);
        } finally {
            conn.release();
        }
    });
};
const SQL_SELECT_USER = `SELECT user_id FROM user
where user_id=? && password=sha1(?)`
const authenticateUser = makeQuery(SQL_SELECT_USER, pool);

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'abcd1234'
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const mkAuth = (passport) => {
    return (req, resp, next) => {
        passport.authenticate('local',
            (err, user, info) => {
                if ((null != err) || (!user)) {
                    resp.status(401)
                    resp.type('application/json')
                    resp.json({ error: err })
                    return
                }
                // attach user to the request object
                req.user = user
                next()
            }
        )(req, resp, next)
    }
}
passport.use(
    new LocalStrategy(
        { usernameField: 'username', passwordField: 'password' },
        async (user, password, done) => {
            // perform the authentication
            console.info(`LocalStrategy> username: ${user}, password: ${password}`)
            const conn = await pool.getConnection()
            try {
                const [ result, _ ] = await conn.query(SQL_SELECT_USER, [ user, password ])
                console.info('>>> result: ', result)
                if (result.length > 0)
                    done(null, {
                        username: result[0].user_id,
                        avatar: `https://i.pravatar.cc/400?u=${result[0].email}`,
                        loginTime: (new Date()).toString()
                    })
                else
                    done('Incorrect login', false)
            } catch(e) {
                done(e, false)
            } finally {
                conn.release()
            }
        }
    )
)
const localStrategyAuth = mkAuth(passport)

const app = express()
const PORT = parseInt(process.env.PORT) || 3000

app.use(cors())
app.use(morgan('combined'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(passport.initialize())

app.get('/quote', async (req, res) => {
    const result = await fetch('http://api.quotable.io/random')
    const quote = await result.json()
    console.log(quote)

    res.status(200)
    res.send(quote)
})

app.post('/authentication', 
    // passport middleware to perform login
    // passport.authenticate('local', { session: false }),
    // authenticate with custom error handling
    localStrategyAuth,
    (req, resp) => {
        // do something 
        console.info(`user: `, req.user)
        // generate JWT token
        const timestamp = (new Date()).getTime() / 1000
        const token = jwt.sign({
            sub: req.user.username,
            iss: 'typing-game',
            iat: timestamp,
            //nbf: timestamp + 30,
            exp: timestamp + (60 * 60),
            data: {
                avatar: req.user.avatar,
                loginTime: req.user.loginTime
            }
        }, TOKEN_SECRET)

        resp.status(200)
        resp.type('application/json')
        resp.json({ message: `Login in at ${new Date()}`, token })
    }
)

app.get('/protected/secret',
    (req, resp, next) => {
        // check if the request has Authorization header
        const auth = req.get('Authorization')
        if (null == auth) {
            resp.status(403)
            resp.json({ message: 'Missing Authorization header' })
            return
        }
        // Bearer authorization
        // Bearer <token>
        const terms = auth.split(' ')
        if ((terms.length != 2) || (terms[0] != 'Bearer')) {
            resp.status(403)
            resp.json({ message: 'Incorrect Authorization' })
            return
        }

        const token = terms[1]
        try {
            // verify token
            const verified = jwt.verify(token, TOKEN_SECRET)
            console.info(`Verified token: `, verified)
            req.token = verified
            next()
        } catch(e) {
            resp.status(403)
            resp.json({ message: 'Incorrect token', error: e })
            return
        }

    },
    (req, resp) => {
        resp.status(200),
        resp.json({ userVerified: true })
    }
)


app.listen(PORT, () => {
    console.log(`Application started on port ${PORT} at ${new Date()}`)
})


// app.post('/authentication', async (req, res) => {
//     try {
//         let result
//         // console.log('authenticating...', req.body)
//         await authenticateUser([req.body.username, req.body.password])
//             .then(result => {
//                 this.result = result
//             })
//         if (this.result === undefined) {
//             throw new Error
//         } else {
//             res.status(200)
//             res.type('application/json')
//             res.send({message: 'user validated'})
//         }
//     } catch (e) {
//         console.log('ERROR: ', e)
//         res.status(401)
//         res.type('application/json')
//         res.send({message: 'wrong username or password'})
//     }
// })
