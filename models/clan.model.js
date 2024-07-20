const mongoose = require('mongoose')
const SocialMediaSchema = require('./socialmedia.schema')

const clanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    tag: {
        type: String,
        required: true,
        uppercase: true,
        max: [6, 'Clan tag must be 2 - 6 characters!'],
        min: [2, 'Clan tag must be 2 - 6 characters!']
    },
    description: {
        type: String,
        required: false,
        maxLength: 1000,
        default: ""
    },
    logo: {
        type: String,
        required: false,
        default: "https://static.vecteezy.com/system/resources/thumbnails/004/511/281/small/default-avatar-photo-placeholder-profile-picture-vector.jpg"
    },
    owners: {
        type: [mongoose.ObjectId],
        ref: 'User',
        validate: {
            validator: v => v.length >= 1,
            message: props => `${props.path} must be at least 1`
        },
        required: true
    },
    socials: {
        type: [SocialMediaSchema],
        validate: {
            validator: v => v.length <= 10,
            message: props => `${props.path} exceeds the limit of 10`
        }
    },
    categories: {
        type: [String],
        lowercase: true,
        enum: ['acc', 'speed', 'challenge', 'ranked', 'fun', 'tech', 'everything'],
        default: ['everything']
    },
    member_count: {
        type: Number,
        min: 0,
        default: 0
    },
    members: {
        type: [mongoose.ObjectId],
        ref: 'User'
    },
    positive_ratings: {
        type: [mongoose.ObjectId],
        ref: 'User'
    },
    negative_ratings: {
        type: [mongoose.ObjectId],
        ref: 'User'
    },
    bsch_approved: {
        type: Boolean,
        default: false
    },
    created_by: {
        type: mongoose.ObjectId,
        ref: 'User',
        required: true
    },
    edited_at: {
        type: Number,
        default: Math.floor(Date.now() / 1000)
    },
    created_at: {
        type: Number,
        immutable: true,
        default: Math.floor(Date.now() / 1000)
    }
})

// Function to recalculate member_count
async function recalculateMemberCount(doc) {
    if (doc) {
        const updatedDoc = await doc.model.findById(doc._id).exec();
        updatedDoc.member_count = updatedDoc.members.length;
        await updatedDoc.save();
    }
}

// Post-update hook to recalculate member_count after any update operation
clanSchema.post('findOneAndUpdate', function (doc) {
    recalculateMemberCount(doc);
});

// Post-remove hook to recalculate member_count after any remove operation
clanSchema.post('remove', function (doc) {
    recalculateMemberCount(doc);
});

module.exports = mongoose.model('Clan', clanSchema)