require('dotenv').config();
const app = require('./app');
const port = 3334;

app.listen(port, () => {
  console.log(`RMS API running on port ${port}`);
});
