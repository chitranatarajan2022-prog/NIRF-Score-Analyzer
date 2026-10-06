const mongoose = require('mongoose');
const { DEPARTMENTS, DEPARTMENT_ALIAS_MAP } = require('./DepartmentStrength');

const PROJECT_FUNDING_DB_NAME = process.env.PROJECT_FUNDING_DB_NAME || 'project_funding_data';

// Schema for individual Project Funding record per department
const projectFundingSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: [true, 'Department identifier is required'],
      trim: true
    },
    sl_no: {
      type: Number,
      default: 1
    },
    pi_name: {
      type: String,
      required: [true, 'Name of the PI is required'],
      trim: true
    },
    copi_name: {
      type: String,
      default: '',
      trim: true
    },
    funding_agency: {
      type: String,
      default: '',
      trim: true
    },
    amount_received: {
      type: Number,
      default: 0
    },
    project_title: {
      type: String,
      required: [true, 'Title of the Project is required'],
      trim: true
    },
    month_year: {
      // Stored as MON YYYY string e.g. "JAN 2024" or "01/2024"
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Helper to get or register Mongoose model for a specific department collection in 'project_funding_data' database
const getProjectFundingModel = (deptId) => {
  const normalizedKey = (deptId || '').trim().toUpperCase();
  const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

  // Use the dedicated 'project_funding_data' database
  const pfDb = mongoose.connection.useDb(PROJECT_FUNDING_DB_NAME, { useCache: true });

  if (pfDb.models[collectionName]) {
    return pfDb.models[collectionName];
  }
  return pfDb.model(collectionName, projectFundingSchema, collectionName);
};

module.exports = {
  PROJECT_FUNDING_DB_NAME,
  projectFundingSchema,
  getProjectFundingModel,
  DEPARTMENTS,
  DEPARTMENT_ALIAS_MAP
};
