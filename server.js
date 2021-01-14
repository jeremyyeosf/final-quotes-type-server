require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
const mysql = require("mysql2/promise");
const { MongoClient } = require("mongodb");

const MONGO_USERNAME = process.env.MONGO_USERNAME || "";
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || "";
const MONGO_DATABASE = process.env.MONGO_DATABASE || "typinggame";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "playerdata";
const MONGO_URL = `mongodb+srv://${MONGO_USERNAME}:${MONGO_PASSWORD}@cluster0.b6fu0.mongodb.net/${MONGO_DATABASE}?retryWrites=true&w=majority`;
const mongoClient = new MongoClient(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const SQL_SELECT_USER = `SELECT id, user_id FROM user
where user_id=? && password=sha1(?)`;
const SQL_INSERT_USER = `insert into user(user_id, password) values
(?, sha1(?))`;
const SQL_INSERT_CONTACTS = `insert into contacts(user_id, email) values
(?, ?)`;

const pool = mysql.createPool({
    host: process.env.MYSQL_SERVER,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    connectionLimit: process.env.MYSQL_CONNECTION,
    timezone: "+08:00",
});
const makeQuery = (query, pool) => {
    return async (args) => {
        const conn = await pool.getConnection();
        try {
            let results = await conn.query(query, args || []);
            return results[0];
        } catch (error) {
            console.log(error);
        } finally {
            conn.release();
        }
    };
};
const selectUser = makeQuery(SQL_SELECT_USER, pool);
const insertUser = makeQuery(SQL_INSERT_USER, pool);
const insertContacts = makeQuery(SQL_INSERT_CONTACTS, pool);

const TOKEN_SECRET = process.env.TOKEN_SECRET || "";
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const mkAuth = (passport) => {
    return (req, resp, next) => {
        passport.authenticate("local", (err, user, info) => {
            if (null != err || !user) {
                resp.status(401);
                resp.type("application/json");
                resp.json({ error: err });
                return;
            }
            // attach user to the request object
            req.user = user;
            next();
        })(req, resp, next);
    };
};
passport.use(
    new LocalStrategy(
        { usernameField: "username", passwordField: "password" },
        async (user, password, done) => {
            // perform the authentication
            console.info(
                `LocalStrategy> username: ${user}, password: ${password}`
            );
            const conn = await pool.getConnection();
            try {
                const [result, _] = await conn.query(SQL_SELECT_USER, [
                    user,
                    password,
                ]);
                console.info(">>> result: ", result);
                if (result.length > 0)
                    done(null, {
                        username: result[0].user_id,
                        avatar: `https://i.pravatar.cc/400?u=${result[0].email}`,
                        loginTime: new Date().toString(),
                    });
                else done("Incorrect login", false);
            } catch (e) {
                done(e, false);
            } finally {
                conn.release();
            }
        }
    )
);

const localStrategyAuth = mkAuth(passport);

const transporter = nodemailer.createTransport({
    port: 465, // true for 465, false for other ports
    host: "smtp.gmail.com",
    auth: {
        user: "jeremyyeo.sf5@gmail.com",
        pass: "Y)TS2dJ)cr`P9){2",
    },
    secure: true,
});

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.options('*', cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.post("/signup", async (req, res) => {
    let { email, username, password } = req.body;
    // console.log(email, username, password);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction()
        let result = await conn.query(SQL_SELECT_USER, [username, password])
        if (result[0].length == 0) {
            let insertUserResult = await conn.query(SQL_INSERT_USER, [username, password])
            let user_id = insertUserResult[0].insertId;
            console.log('user_id:', user_id);
            let insertContactsResult = await conn.query(SQL_INSERT_CONTACTS, [user_id, email])
            console.log(insertContactsResult[0]);
            await conn.commit()
            res.status(200).json({ message: "completed transaction" });
        } else {
            res.status(409).send({ message: "username already exists" });
        }
    } catch (error) {
        console.log(error);
        res.status(400).json(error);
        conn.rollback();
    } finally {
        conn.release();
    }
});

app.post("/email", (req, res) => {
    const { to, subject, text } = req.body;
    const mailData = {
        from: "jeremyyeo.sf5@gmail.com", // sender address
        to: to, // list of receivers
        subject: subject,
        text: text.join("\n\n"),
    };

    transporter.sendMail(mailData, (error, info) => {
        if (error) {
            return console.log(error);
        }
        res.status(200);
        res.send({ message: "Mail sent", message_id: info });
    });
});

app.get("/api/data", async (req, res) => {
    // get top 10 scores from Mongo ranked by score
    const result = await mongoClient
        .db("typinggame")
        .collection("playerdata")
        .find()
        .project({ playerName: 1, playerScore: 1 })
        .sort({ playerScore: -1 })
        .limit(10)
        .toArray();

    res.status(200);
    res.type("application/json");
    res.json(result);
    res.status(200);
});

app.post("/api/data", async (req, res) => {

    const playerData = {
        playerName: req.body.playerName,
        playerScore: req.body.playerScore,
        totalTimeTaken: req.body.totalTimeTaken,
        quotesCompleted: req.body.quotesCompleted,
    };
    // console.log("EXPRESS API DATA POSTED:", playerData);

    const result = await mongoClient
        .db(MONGO_DATABASE)
        .collection(MONGO_COLLECTION)
        .insertOne(playerData);
    res.status(200);
    res.json({ message: "sent to mongo", result: result });
});

app.get("/quote/:category", async (req, res) => {
    console.log("req: ", req.query);
    let category = req.params["category"];
    console.log("params: ", category);
    if (category == "random") {
        category = "";
    }
    const result = await fetch(
        `http://api.quotable.io/random?maxLength=${req.query.maxLength}&tags=${category}`
    );
    const quote = await result.json();
    // console.log(quote);

    res.status(200);
    res.send(quote);
});

app.post(
    "/authentication",
    // passport middleware to perform login
    // passport.authenticate('local', { session: false }),
    // authenticate with custom error handling
    localStrategyAuth,
    (req, resp) => {
        // do something
        console.info(`user: `, req.user);
        // generate JWT token
        const timestamp = new Date().getTime() / 1000;
        const token = jwt.sign(
            {
                sub: req.user.username,
                iss: "typing-game",
                iat: timestamp,
                //nbf: timestamp + 30,
                exp: timestamp + 60 * 60,
                data: {
                    avatar: req.user.avatar,
                    loginTime: req.user.loginTime,
                },
            },
            TOKEN_SECRET
        );

        resp.status(200);
        resp.type("application/json");
        resp.json({ message: `Login in at ${new Date()}`, token });
    }
);

app.get(
    "/protected/secret",
    (req, resp, next) => {
        // check if the request has Authorization header
        const auth = req.get("Authorization");
        if (null == auth) {
            resp.status(403);
            resp.json({ message: "Missing Authorization header" });
            return;
        }
        // Bearer authorization
        // Bearer <token>
        const terms = auth.split(" ");
        if (terms.length != 2 || terms[0] != "Bearer") {
            resp.status(403);
            resp.json({ message: "Incorrect Authorization" });
            return;
        }

        const token = terms[1];
        try {
            // verify token
            const verified = jwt.verify(token, TOKEN_SECRET);
            console.info(`Verified token: `, verified);
            req.token = verified;
            next();
        } catch (e) {
            resp.status(403);
            resp.json({ message: "Incorrect token", error: e });
            return;
        }
    },
    (req, resp) => {
        resp.status(200),
            // resp.send(true)
            resp.json({ userVerified: true });
    }
);



const p0 = (async () => {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
})();

const p1 = (async () => {
    await mongoClient.connect();
    return true;
})();

Promise.all([p0, p1]).then((r) => {
    app.listen(PORT, () => {
        console.info(`Application started on port ${PORT} at ${new Date()}`);
    });
});

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

// fs.mkdir("./temp", { recursive: true }, (err) => {
//     if (err) throw err;
// });
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, "./temp");
//     },
//     filename: function (req, file, cb) {
//         let extArray = file.mimetype.split("/");
//         let extension = extArray[extArray.length - 1];
//         cb(null, new Date().getTime() + "." + extension);
//     },
// });

// const readFile = (path) =>
//     new Promise((resolve, reject) =>
//         fs.readFile(path, (err, buff) => {
//             if (null != err) reject(err);
//             else resolve(buff);
//         })
//     );
// const putObject = (file, buff, s3) =>
//     new Promise((resolve, reject) => {
//         const params = {
//             Bucket: AWS_S3_BUCKET_NAME,
//             Key: file.filename,
//             Body: buff,
//             ACL: "public-read",
//             ContentType: file.mimetype,
//             ContentLength: file.size,
//         };
//         s3.putObject(params, (err, result) => {
//             if (null != err) reject(err);
//             else resolve(file.filename);
//         });
//     });

// const multer = require("multer");
// const AWS = require("aws-sdk");
// const fs = require("fs");
// multerS3 = require('multer-s3');

// const AWS_S3_HOSTNAME = process.env.AWS_S3_HOSTNAME;
// const AWS_S3_ACCESSKEY_ID = process.env.AWS_S3_ACCESSKEY_ID;
// const AWS_S3_SECRET_ACCESSKEY = process.env.AWS_S3_SECRET_ACCESSKEY;
// const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
// const endpoint = new AWS.Endpoint(AWS_S3_HOSTNAME);
// const s3 = new AWS.S3({
//     endpoint,
//     accessKeyId: AWS_S3_ACCESSKEY_ID,
//     secretAccessKey: AWS_S3_SECRET_ACCESSKEY,
// });
// const upload = multer({
//     storage: multerS3({
//         s3: s3,
//         bucket: AWS_S3_BUCKET_NAME,
//         acl: 'public-read',
//         key: (request, file, callback) => {
//             console.log('file:', file)
//             callback(null, new Date().getTime() + '_' + file.originalname)
//         }
//     })
// }).single('profilePicture')

// const p3 = new Promise((resolve, reject) => {
//     s3.headBucket(
//         {
//             Bucket: AWS_S3_BUCKET_NAME,
//         },
//         function (err, data) {
//             if (err) {
//                 console.log(err, err.stack);
//                 reject(err);
//             } else {
//                 resolve("success");
//             }
//         }
//     );
// });

// upload(req, res, (error) => {
//     if (error) {
//         console.log(error)
//         return res.redirect('/error')
//     }
//     console.log('Image upload success')
//     res.status(200)
//     res.json({
//         message: 'Image uploaded to DigitalOcean',
//         s3_file_key: res.req.file.location
//     })
// })
// const makeQuery = (sql, pool) => {
//     return async (args) => {
//         const conn = await pool.getConnection();
//         try {
//             let results = await conn.query(sql, args || []);
//             if (results[0].length == 0) {
//                 throw new Error();
//             } else {
//                 return results[0];
//             }
//         } catch (err) {
//             console.log("no results from SQL", err);
//         } finally {
//             conn.release();
//         }
//     };
// };

// const authenticateUser = makeQuery(SQL_SELECT_USER, pool);

// app.get('/auth/google',
//   passport.authenticate('google', { scope: ["profile", "email"]})
// );

// app.get('/auth/google/callback', 
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   function(req, res) {
//     // Successful authentication, redirect home.
//     res.redirect(`http://localhost:8080/dashboard`);
// });
// const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
// const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

// var GoogleStrategy = require('passport-google-oauth20').Strategy;
// passport.use(new GoogleStrategy({
//     clientID: GOOGLE_CLIENT_ID,
//     clientSecret: GOOGLE_CLIENT_SECRET,
//     callbackURL: "http://localhost:3000/auth/google/callback"
//   },
//   function(accessToken, refreshToken, profile, cb) {
//     User.findOrCreate({ googleId: profile.id }, function (err, user)               {
//      return done(err, profile);
//     });
//   }
// ));



// const {OAuth2Client} = require('google-auth-library');
// const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// async function verify(token) {
//     const ticket = await client.verifyIdToken({
//         idToken: token,
//         audience: GOOGLE_CLIENT_ID,  // Specify the CLIENT_ID of the app that accesses the backend
//         // Or, if multiple clients access the backend:
//         //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
//     });
//     const payload = ticket.getPayload();
//     const userid = payload['sub'];
//     return userid
//     // If request specified a G Suite domain:
//     // const domain = payload['hd'];
//   }
  
  
//   app.post('/googleauth', async (req, res) => {
//       console.log('req.body', req.body)
//       let token = req.body['token']
//       let result = await verify(token)
//       console.log('RESULT', result)
//       res.status(200).json({message: 'google authorised'})
  
//   })
