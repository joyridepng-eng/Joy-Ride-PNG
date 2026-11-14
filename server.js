const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Joy Ride PNG deployed successfully on Render!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
