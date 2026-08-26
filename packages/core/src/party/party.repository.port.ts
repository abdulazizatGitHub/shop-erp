/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 *
 * P2-1 scope only: supplier create/read/search. `party` also carries
 * customer and staff rows (docs/DATABASE_RULES.md — one table, three party
 * types), but nothing beyond supplier is built this phase.
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

export interface PartyRepositoryPort {
  /**
   * Inserts the party row with party_type = 'supplier'. Generates
   * partyCode via document_sequence (doc_type = 'supplier') when the
   * input's partyCode is null.
   */
  createSupplier(input: NewSupplierInput): Promise<NewSupplierResult>;
  getSupplierById(id: string): Promise<SupplierRecord | null>;
  searchSuppliers(query: SupplierSearchQuery): Promise<readonly SupplierRecord[]>;
}
