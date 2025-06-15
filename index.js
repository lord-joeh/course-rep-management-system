const app = require('./app');
const PORT = process.env.PORT || 4000;

app.listen(PORT, (error) => {
  error
    ? console.error('Error starting up server: ', error.message)
    : console.log(`Server running on ${PORT}`);
});
