const mongoose = require('mongoose');
const { DEPARTMENTS, DEPARTMENT_ALIAS_MAP } = require('./DepartmentStrength');

const EXPENDITURE_DB_NAME = process.env.EXPENDITURE_DB_NAME || 'expenditure_data';

const expenditureSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: [true, 'Department identifier is required'],
      trim: true
    },
    capex: {
      library: { type: Map, of: Number, default: {} },
      equipment: { type: Map, of: Number, default: {} },
      workshop: { type: Map, of: Number, default: {} },
      other_cap: { type: Map, of: Number, default: {} }
    },
    opex: {
      salaries: { type: Map, of: Number, default: {} },
      maintenance: { type: Map, of: Number, default: {} },
      seminars: { type: Map, of: Number, default: {} }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

expenditureSchema.index({ department: 1 }, { unique: true });

/**
 * Get or register Mongoose model for a specific department collection in 'expenditure_data' database
 */
const getExpenditureModel = (deptId) => {
  const normalizedKey = (deptId || '').trim().toUpperCase();
  const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
  const expDb = mongoose.connection.useDb(EXPENDITURE_DB_NAME, { useCache: true });

  if (expDb.models[collectionName]) {
    return expDb.models[collectionName];
  }
  return expDb.model(collectionName, expenditureSchema, collectionName);
};

module.exports = {
  EXPENDITURE_DB_NAME,
  expenditureSchema,
  getExpenditureModel,
  DEPARTMENTS,
  DEPARTMENT_ALIAS_MAP
};
