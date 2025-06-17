const { log } = require('console');
const app = require('./app');
const PORT = process.env.PORT || 4000;
const { connect } = require('./config/db');
const { randomBytes } = require('crypto');

app.listen(PORT, (error) => {
  error
    ? console.error('Error starting up server: ', error.message)
    : console.log(`Server running on ${PORT}`);
  (async () => {
    try {
      const client = await connect();
      console.log('Database connected successfully!');
      client.release();
    } catch (err) {
      console.error('Database connection error:', err);
    }
  })();
});
