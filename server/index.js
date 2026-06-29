const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const favoritesRoutes = require('./routes/favoritesRoutes');
const agentRoutes = require('./routes/agentRoutes');
const kycRoutes = require('./routes/kycRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes
app.use('/api', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/kyc', kycRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
