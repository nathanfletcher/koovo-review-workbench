// GENERATED FILE - do not edit by hand.
// Produced by scripts/generate-fixture.js by running each sandbox preset through
// the real engine, so the UI tests cannot disagree with the server.
import type { ValidateResponse } from '../types/workbench';

export interface SandboxFixture {
  presetId: string;
  context: 'isolated' | 'dataset';
  /** Canonical key of the request body the UI sends. */
  key: string;
  response: ValidateResponse;
}

export const SANDBOX_FIXTURES: SandboxFixture[] = [
  {
    "presetId": "clean",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"10.00\",\"supplier\":\"Test Supplier\",\"total\":\"12.00\",\"type\":\"Bill\",\"vat\":\"2.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 1,
        "needsAttention": 0,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "10.00",
          "vat": "2.00",
          "total": "12.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": true,
          "validationStatus": "Valid",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "clean",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"10.00\",\"supplier\":\"Test Supplier\",\"total\":\"12.00\",\"type\":\"Bill\",\"vat\":\"2.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 1,
        "needsAttention": 0,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "10.00",
          "vat": "2.00",
          "total": "12.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": true,
          "validationStatus": "Valid",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "bad-total",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"300.00\",\"supplier\":\"Test Supplier\",\"total\":\"365.00\",\"type\":\"Bill\",\"vat\":\"60.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "300.00",
          "vat": "60.00",
          "total": "365.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "TOTAL_MISMATCH",
              "field": "total",
              "message": "Total (£365.00) does not equal Subtotal (£300.00) plus VAT (£60.00) (expected £360.00)."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "bad-total",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"300.00\",\"supplier\":\"Test Supplier\",\"total\":\"365.00\",\"type\":\"Bill\",\"vat\":\"60.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "300.00",
          "vat": "60.00",
          "total": "365.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "TOTAL_MISMATCH",
              "field": "total",
              "message": "Total (£365.00) does not equal Subtotal (£300.00) plus VAT (£60.00) (expected £360.00)."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "penny-out",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"100.00\",\"supplier\":\"Test Supplier\",\"total\":\"120.01\",\"type\":\"Bill\",\"vat\":\"20.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "100.00",
          "vat": "20.00",
          "total": "120.01",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "TOTAL_MISMATCH",
              "field": "total",
              "message": "Total (£120.01) does not equal Subtotal (£100.00) plus VAT (£20.00) (expected £120.00)."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "penny-out",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"100.00\",\"supplier\":\"Test Supplier\",\"total\":\"120.01\",\"type\":\"Bill\",\"vat\":\"20.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "100.00",
          "vat": "20.00",
          "total": "120.01",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "TOTAL_MISMATCH",
              "field": "total",
              "message": "Total (£120.01) does not equal Subtotal (£100.00) plus VAT (£20.00) (expected £120.00)."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "missing-supplier",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"10.00\",\"supplier\":\"-\",\"total\":\"12.00\",\"type\":\"Bill\",\"vat\":\"2.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": null,
          "subtotal": "10.00",
          "vat": "2.00",
          "total": "12.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "MISSING_SUPPLIER",
              "field": "supplier",
              "message": "Posted record is missing a supplier name."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "missing-supplier",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"10.00\",\"supplier\":\"-\",\"total\":\"12.00\",\"type\":\"Bill\",\"vat\":\"2.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": null,
          "subtotal": "10.00",
          "vat": "2.00",
          "total": "12.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "MISSING_SUPPLIER",
              "field": "supplier",
              "message": "Posted record is missing a supplier name."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "negative-bill",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"-30.00\",\"supplier\":\"Test Supplier\",\"total\":\"-36.00\",\"type\":\"Bill\",\"vat\":\"-6.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "-30.00",
          "vat": "-6.00",
          "total": "-36.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "NEGATIVE_BILL_AMOUNT",
              "field": "total",
              "message": "Posted Bill records must have non-negative amounts (Subtotal: -£30.00, VAT: -£6.00, Total: -£36.00)."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "negative-bill",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Posted\",\"subtotal\":\"-30.00\",\"supplier\":\"Test Supplier\",\"total\":\"-36.00\",\"type\":\"Bill\",\"vat\":\"-6.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Test Supplier",
          "subtotal": "-30.00",
          "vat": "-6.00",
          "total": "-36.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "NEGATIVE_BILL_AMOUNT",
              "field": "total",
              "message": "Posted Bill records must have non-negative amounts (Subtotal: -£30.00, VAT: -£6.00, Total: -£36.00)."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "negative-credit",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-901\",\"sourceStatus\":\"Posted\",\"subtotal\":\"-100.00\",\"supplier\":\"Caldera\",\"total\":\"-120.00\",\"type\":\"Credit\",\"vat\":\"-20.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 1,
        "needsAttention": 0,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-901",
          "type": "Credit",
          "sourceStatus": "Posted",
          "supplier": "Caldera",
          "subtotal": "-100.00",
          "vat": "-20.00",
          "total": "-120.00",
          "transactionKey": "C99::Xero::X-901",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": true,
          "validationStatus": "Valid",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "negative-credit",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-901\",\"sourceStatus\":\"Posted\",\"subtotal\":\"-100.00\",\"supplier\":\"Caldera\",\"total\":\"-120.00\",\"type\":\"Credit\",\"vat\":\"-20.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 1,
        "needsAttention": 0,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-901",
          "type": "Credit",
          "sourceStatus": "Posted",
          "supplier": "Caldera",
          "subtotal": "-100.00",
          "vat": "-20.00",
          "total": "-120.00",
          "transactionKey": "C99::Xero::X-901",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": true,
          "validationStatus": "Valid",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "draft",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Draft\",\"subtotal\":\"300.00\",\"supplier\":\"-\",\"total\":\"999.00\",\"type\":\"Bill\",\"vat\":\"60.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 0,
        "excluded": 1,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Draft",
          "supplier": null,
          "subtotal": "300.00",
          "vat": "60.00",
          "total": "999.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Excluded",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "draft",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C99\",\"source\":\"Xero\",\"sourceId\":\"X-900\",\"sourceStatus\":\"Draft\",\"subtotal\":\"300.00\",\"supplier\":\"-\",\"total\":\"999.00\",\"type\":\"Bill\",\"vat\":\"60.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 0,
        "excluded": 1,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C99",
          "source": "Xero",
          "sourceId": "X-900",
          "type": "Bill",
          "sourceStatus": "Draft",
          "supplier": null,
          "subtotal": "300.00",
          "vat": "60.00",
          "total": "999.00",
          "transactionKey": "C99::Xero::X-900",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": false,
          "validationStatus": "Excluded",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "duplicate-of-r001",
    "context": "isolated",
    "key": "{\"context\":\"isolated\",\"records\":[{\"clientId\":\"C01\",\"source\":\"Xero\",\"sourceId\":\"X-101\",\"sourceStatus\":\"Posted\",\"subtotal\":\"100.00\",\"supplier\":\"Westline Office\",\"total\":\"120.00\",\"type\":\"Bill\",\"vat\":\"20.00\"}]}",
    "response": {
      "context": "isolated",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 1,
        "needsAttention": 0,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C01",
          "source": "Xero",
          "sourceId": "X-101",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Westline Office",
          "subtotal": "100.00",
          "vat": "20.00",
          "total": "120.00",
          "transactionKey": "C01::Xero::X-101",
          "isDuplicate": false,
          "duplicateOfRecordId": null,
          "duplicateKind": null,
          "processedForReporting": true,
          "validationStatus": "Valid",
          "issues": [],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  },
  {
    "presetId": "duplicate-of-r001",
    "context": "dataset",
    "key": "{\"context\":\"dataset\",\"records\":[{\"clientId\":\"C01\",\"source\":\"Xero\",\"sourceId\":\"X-101\",\"sourceStatus\":\"Posted\",\"subtotal\":\"100.00\",\"supplier\":\"Westline Office\",\"total\":\"120.00\",\"type\":\"Bill\",\"vat\":\"20.00\"}]}",
    "response": {
      "context": "dataset",
      "persisted": false,
      "count": 1,
      "summary": {
        "total": 1,
        "valid": 0,
        "needsAttention": 1,
        "excluded": 0,
        "reviewBreakdown": {
          "unreviewed": 1,
          "reviewed": 0,
          "needsCorrection": 0
        }
      },
      "records": [
        {
          "id": "INPUT-1",
          "clientId": "C01",
          "source": "Xero",
          "sourceId": "X-101",
          "type": "Bill",
          "sourceStatus": "Posted",
          "supplier": "Westline Office",
          "subtotal": "100.00",
          "vat": "20.00",
          "total": "120.00",
          "transactionKey": "C01::Xero::X-101",
          "isDuplicate": true,
          "duplicateOfRecordId": "R001",
          "duplicateKind": "identical",
          "processedForReporting": false,
          "validationStatus": "Needs Attention",
          "issues": [
            {
              "code": "DUPLICATE_TRANSACTION",
              "field": "sourceId",
              "message": "Repeated source transaction: C01 / Xero / X-101 was already ingested as R001. Identical copy retained for inspection and excluded from financial processing."
            }
          ],
          "reviewStatus": "Unreviewed",
          "auditHistory": []
        }
      ]
    }
  }
];
