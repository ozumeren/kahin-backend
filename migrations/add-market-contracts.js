// migrations/add-market-contracts.js
const { Sequelize, DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Starting market contracts migration...');

    // Check if market_contracts table already exists
    try {
      await queryInterface.describeTable('market_contracts');
      console.log('ℹ️  market_contracts table already exists, skipping migration...');
      return;
    } catch (error) {
      // Table doesn't exist, continue with migration
      console.log('✅ market_contracts table does not exist, proceeding with creation...');
    }

    // 1. Create market_contracts table
    await queryInterface.createTable('market_contracts', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },

      // Basic Info
      contract_code: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(500),
        allowNull: false
      },
      market_id: {
        type: DataTypes.UUID,
        references: {
          model: 'markets',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },

      // Contract Specification
      scope: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      underlying: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      source_agencies: {
        type: DataTypes.JSONB,
        allowNull: false
      },
      payout_criterion: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      settlement_value: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 1.00
      },

      // Expiration Details
      expiration_date: {
        type: DataTypes.DATE,
        allowNull: false
      },
      expiration_time: {
        type: DataTypes.TIME,
        defaultValue: '10:00:00'
      },
      expiration_timezone: {
        type: DataTypes.STRING(50),
        defaultValue: 'America/New_York'
      },
      expiration_value_definition: {
        type: DataTypes.TEXT
      },

      // Contingency Rules
      contingency_rules: {
        type: DataTypes.JSONB
      },
      postponement_policy: {
        type: DataTypes.TEXT
      },
      review_process_rules: {
        type: DataTypes.TEXT
      },
      dispute_resolution_process: {
        type: DataTypes.TEXT
      },

      // Additional Terms
      market_type: {
        type: DataTypes.STRING(50)
      },
      tick_size: {
        type: DataTypes.DECIMAL(10, 4),
        defaultValue: 0.01
      },
      position_limit: {
        type: DataTypes.INTEGER
      },
      trading_hours: {
        type: DataTypes.JSONB
      },

      // Metadata
      created_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      reviewed_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      approved_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },

      // Status
      status: {
        type: DataTypes.ENUM('draft', 'pending_review', 'approved', 'active', 'expired', 'resolved'),
        defaultValue: 'draft'
      },
      version: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      },
      parent_contract_id: {
        type: DataTypes.UUID,
        references: {
          model: 'market_contracts',
          key: 'id'
        }
      },

      // Legal & Compliance
      cftc_filing_reference: {
        type: DataTypes.STRING(255)
      },
      legal_notes: {
        type: DataTypes.TEXT
      },
      risk_disclosures: {
        type: DataTypes.TEXT
      },

      // Resolution
      resolved_outcome: {
        type: DataTypes.BOOLEAN
      },
      expiration_value: {
        type: DataTypes.DECIMAL(20, 8)
      },
      resolution_notes: {
        type: DataTypes.TEXT
      },

      // Timestamps
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      reviewed_at: {
        type: DataTypes.DATE
      },
      approved_at: {
        type: DataTypes.DATE
      },
      published_at: {
        type: DataTypes.DATE
      },
      resolved_at: {
        type: DataTypes.DATE
      }
    });

    console.log('✅ market_contracts table created');

    // 2. Create contract_resolution_evidence table
    await queryInterface.createTable('contract_resolution_evidence', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      contract_id: {
        type: DataTypes.UUID,
        references: {
          model: 'market_contracts',
          key: 'id'
        },
        allowNull: false,
        onDelete: 'CASCADE'
      },

      // Evidence Details
      source_agency: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      evidence_type: {
        type: DataTypes.STRING(100)
      },
      evidence_url: {
        type: DataTypes.TEXT
      },
      evidence_data: {
        type: DataTypes.JSONB
      },
      evidence_file_path: {
        type: DataTypes.TEXT
      },

      // Verification
      collected_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      collected_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      verified_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      verified_at: {
        type: DataTypes.DATE
      },

      // Metadata
      notes: {
        type: DataTypes.TEXT
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    console.log('✅ contract_resolution_evidence table created');

    // 3. Create contract_amendments table
    await queryInterface.createTable('contract_amendments', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      contract_id: {
        type: DataTypes.UUID,
        references: {
          model: 'market_contracts',
          key: 'id'
        },
        allowNull: false,
        onDelete: 'CASCADE'
      },

      // Amendment Details
      amendment_type: {
        type: DataTypes.STRING(100)
      },
      field_changed: {
        type: DataTypes.STRING(255)
      },
      old_value: {
        type: DataTypes.TEXT
      },
      new_value: {
        type: DataTypes.TEXT
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      // Approval
      created_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      approved_by: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      approved_at: {
        type: DataTypes.DATE
      },

      // Metadata
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    console.log('✅ contract_amendments table created');

    // 4. Create indices
    await queryInterface.addIndex('market_contracts', ['contract_code'], {
      name: 'idx_market_contracts_code'
    });
    await queryInterface.addIndex('market_contracts', ['market_id'], {
      name: 'idx_market_contracts_market'
    });
    await queryInterface.addIndex('market_contracts', ['status'], {
      name: 'idx_market_contracts_status'
    });
    await queryInterface.addIndex('market_contracts', ['expiration_date'], {
      name: 'idx_market_contracts_expiration'
    });
    await queryInterface.addIndex('market_contracts', ['created_by'], {
      name: 'idx_market_contracts_creator'
    });

    await queryInterface.addIndex('contract_resolution_evidence', ['contract_id'], {
      name: 'idx_evidence_contract'
    });

    await queryInterface.addIndex('contract_amendments', ['contract_id'], {
      name: 'idx_amendments_contract'
    });

    console.log('✅ All indices created');

    console.log('✅ Market contracts migration completed successfully!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    console.log('🔄 Rolling back market contracts migration...');

    await queryInterface.dropTable('contract_amendments');
    await queryInterface.dropTable('contract_resolution_evidence');
    await queryInterface.dropTable('market_contracts');

    console.log('✅ Market contracts migration rolled back');
  }
};
