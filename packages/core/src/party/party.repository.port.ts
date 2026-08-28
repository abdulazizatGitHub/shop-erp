/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 *
 * P2-1 built supplier create/read/search. P3-1 adds customer
 * create/read/search/balance. `party` also carries staff rows
 * (docs/DATABASE_RULES.md — one table, three party types), not built yet.
 */
export interface NewSupplierInput {
  readonly partyCode: string | null;
  readonly name: string;
  readonly shopName: string | null;
  readonly phone: string;
  readonly cityArea: string | null;
  readonly paymentTerms: string | null;
  readonly notes: string | null;
}

export interface NewSupplierResult {
  readonly id: string;
  readonly partyCode: string;
}

export interface SupplierRecord {
  readonly id: string;
  readonly partyCode: string;
  readonly name: string;
  readonly shopName: string | null;
  readonly phone: string | null;
  readonly cityArea: string | null;
  readonly paymentTerms: string | null;
  readonly notes: string | null;
}

export interface SupplierSearchQuery {
  readonly query: string;
}

export interface SupplierBalance {
  readonly supplierId: string;
  readonly name: string;
  readonly balancePaisa: number;
}

/** 'retail' | 'wholesale' — lowercase, matching every other enum-like column in the schema. */
export type CustomerType = 'retail' | 'wholesale';

export interface NewCustomerInput {
  readonly partyCode: string | null;
  readonly name: string;
  readonly shopName: string | null;
  readonly phone: string | null;
  readonly customerType: CustomerType | null;
  readonly priceLevelId: string | null;
  readonly creditLimitPaisa: number | null;
  readonly notes: string | null;
}

export interface NewCustomerResult {
  readonly id: string;
  readonly partyCode: string;
}

export interface CustomerRecord {
  readonly id: string;
  readonly partyCode: string;
  readonly name: string;
  readonly shopName: string | null;
  readonly phone: string | null;
  readonly customerType: CustomerType | null;
  readonly priceLevelId: string | null;
  readonly creditLimitPaisa: number | null;
  readonly notes: string | null;
}

export interface CustomerSearchQuery {
  readonly query: string;
}

export interface CustomerBalance {
  readonly customerId: string;
  readonly balancePaisa: number;
}

export interface PartyRepositoryPort {
  /**
   * Inserts the party row with party_type = 'supplier'. Generates
   * partyCode via document_sequence (doc_type = 'supplier') when the
   * input's partyCode is null.
   */
  createSupplier(input: NewSupplierInput): Promise<NewSupplierResult>;
  getSupplierById(id: string): Promise<SupplierRecord | null>;
  searchSuppliers(query: SupplierSearchQuery): Promise<readonly SupplierRecord[]>;
  /** Reads v_party_balance — never re-implements the SUM in TypeScript. */
  getSupplierBalance(supplierId: string): Promise<SupplierBalance>;

  /**
   * Inserts the party row with party_type = 'customer'. Generates
   * partyCode via document_sequence (doc_type = 'customer', prefix CUS)
   * when the input's partyCode is null. Write path — implementations
   * must wrap this in withRetry (see PROJECT.md BUG-15).
   */
  createCustomer(input: NewCustomerInput): Promise<NewCustomerResult>;
  getCustomerById(id: string): Promise<CustomerRecord | null>;
  searchCustomers(query: CustomerSearchQuery): Promise<readonly CustomerRecord[]>;
  /** Reads v_party_balance — never re-implements the SUM in TypeScript. */
  getCustomerBalance(customerId: string): Promise<CustomerBalance>;
}
