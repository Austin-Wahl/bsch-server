const router = require('express').Router()
// api routes
router.use('/api/weekly-challenge/', require('./weeklychallenge.router'))
router.use('/api/clan/member/application', require('./clanmemberapplication.router'))
router.use('/api/clan/application/', require('./clanapplication.router'))
router.use('/api/clan/', require('./clan.router'))
router.use('/api/user/', require('./user.router'))

module.exports = router