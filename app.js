const express = require('express')
const app = express()
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
require('dotenv').config()
require('./mongoose')
const cookieParser = require('cookie-parser')
app.use(cookieParser())
// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Middleware to parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

const User = require('./models/user.model')
const Clan = require('./models/clan.model')

app.get('/', (req, res) => {
    res.status(200).send("heya")
})

// I've seperated the discord auth router and api router for my own sanity
app.use(require('./authentication/discordOauth'))
app.use(require('./router/router'))

async function makeUser() {
    let user =  new User({
        discord_id: 637870142218436629,
        username: "yosuke_bs",
        avatar: "https://cdn.discordapp.com/avatars/637870142218436629/27ae3b8b1b9fb33b47aae6246d4055c4.webp",
        bio: "Heya! I'm Yosuke. A web developer and administrator on the Beat Saber Clan Hub Discord server!",
        socials: [
            {
                platform: "twitter", 
                platform_profile_link: "https://x.com/potus",
                platform_logo: "https://static.dezeen.com/uploads/2023/07/x-logo-twitter-elon-musk_dezeen_2364_col_0.jpg"
            }
        ]
    })

    user.joined_clans = ["6684a3c71fa3a710653e5f2b"]

    user.save()
}

async function makeClan() {
    let clan = new Clan({
        name: "New Clan",
        tag: "NC",
        description: "We are the vegabonds 8)",
        owners: ['6684874ccbce38cc17aed627'],
        members: ['66884299cb677407cf603ba4'],
    })

    clan.save()
}

// makeUser()
// makeClan()

app.listen(process.env.port || 3000, () => {
    try {
        console.log(`Server running on port ${process.env.port}`)
    } catch (error) {
        console.log(error)
    }
})