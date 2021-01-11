const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const fetch = require('node-fetch')
const withQuery = require('with-query').default

const app = express()
const PORT = parseInt(process.env.PORT) || 3000

app.use(cors())
app.use(morgan('combined'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/quote', async (req, res) => {
    const result = await fetch('http://api.quotable.io/random')
    const quote = await result.json()
    console.log(quote)

    // const quoteParsed = quote.map(i => {
    //     return {
    //         title: i.title,
    //         author: i.author,
    //         poem: i.lines
    //     }
    // })
    res.status(200)
    res.send(quote)
})

app.listen(PORT, () => {
    console.log(`Application started on port ${PORT} at ${new Date()}`)
})