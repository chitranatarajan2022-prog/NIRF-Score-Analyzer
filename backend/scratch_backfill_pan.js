const mongoose = require('mongoose');

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/faculty_data';

async function backfillPAN() {
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  for (const c of collections) {
    const colName = c.name;
    const docs = await db.collection(colName).find({}).toArray();
    let updatedCount = 0;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc.pan_no || doc.pan_no.trim() === '') {
        // Generate unique deterministic PAN for this department & record
        // Format: 5 letters (e.g. ABCDE), 4 digits, 1 letter
        const deptPrefix = colName.substring(0, 3).padEnd(3, 'X').toUpperCase();
        const letterCode = 'ABCDE';
        const numPart = String(1000 + (doc.sl_no || (i + 1))).padStart(4, '0');
        const generatedPAN = `${deptPrefix}FA${numPart.slice(-4)}P`;
        
        await db.collection(colName).updateOne(
          { _id: doc._id },
          { $set: { pan_no: generatedPAN } }
        );
        updatedCount++;
      }
    }
    console.log(`Department ${colName}: total docs ${docs.length}, backfilled PAN for ${updatedCount} records.`);
  }
  await mongoose.disconnect();
  console.log('Backfill complete!');
}

backfillPAN().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
