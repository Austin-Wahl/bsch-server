const app = require('express')()
const mongoose = require('mongoose')

connect()

async function connect() {
    try {
        let con = await mongoose.connect(process.env.mongodb_connection)
        console.log(await mongoose.connection.db.admin().listDatabases())
    } catch (error) {
        throw error
    }
}
module.exports = app