import type { CreateItemInput } from '@shop/contracts';
import type {
  ItemRecord,
  ItemRepositoryPort,
  ItemSearchQuery,
  NewItemResult,
} from './item.repository.port.js';

export async function createItem(
  repo: ItemRepositoryPort,
  input: CreateItemInput,
): Promise<NewItemResult> {
  return repo.createItem({
    itemCode: input.itemCode,
    nameEn: input.nameEn,
    nameUr: input.nameUr,
    businessUnitId: input.businessUnitId,
    stockUomId: input.stockUomId,
    trackStock: input.trackStock,
    retailPricePaisa: input.retailPricePaisa,
    altUomId: input.altUomId,
    altUomFactorMilli: input.altUomFactorMilli,
  });
}

export async function getItem(repo: ItemRepositoryPort, id: string): Promise<ItemRecord | null> {
  return repo.getItemById(id);
}

export async function searchItems(
  repo: ItemRepositoryPort,
  query: ItemSearchQuery,
): Promise<readonly ItemRecord[]> {
  return repo.searchItems(query);
}
