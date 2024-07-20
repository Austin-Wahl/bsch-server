const mongoose = require('mongoose')
const clanApplicationSchema = new mongoose.Schema({
    clan_id: {
        type: mongoose.ObjectId,
        ref: 'Clan',
        required: true
    },
    submitted_by: {
        type: mongoose.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        required: true,
        default: "applied",
        enum: ["applied", "in review", "accepted", "denied", "deleted"]
    },
    created_at: {
        type: Number,
        required: true,
        immutable: true,
        default: Math.floor(Date.now() / 1000)
    }
})

module.exports = mongoose.model('clan_application', clanApplicationSchema)