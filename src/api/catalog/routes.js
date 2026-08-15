import express from 'express';
import { packagingInput, positiveId, productInput } from '../../contracts/input.js';
import { activity, conflict, notFound } from '../helpers.js';

export function createCatalogRouter({ store }) {
  const router = express.Router();

  router.get('/products', async (_request, response) => response.json(await store.listProducts()));
  router.post('/products', async (request, response) => {
    const product = await store.createProduct(productInput(request.body));
    await activity(store, request, { action: 'catalog.product.created', entity_type: 'catalog_product', entity_id: product.id, message: `Добавлена продукция «${product.name}».` });
    response.status(201).json(product);
  });
  router.put('/products/:id', async (request, response) => {
    const product = await store.updateProduct(positiveId(request.params.id, 'id'), productInput(request.body));
    if (!product) throw notFound();
    await activity(store, request, { action: 'catalog.product.updated', entity_type: 'catalog_product', entity_id: product.id, message: `Обновлена продукция «${product.name}».` });
    response.json(product);
  });
  router.delete('/products/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const product = await store.getProduct(id);
    if (!product) throw notFound();
    const affected = await store.screensUsingCatalog('product', id);
    if (affected.length) throw conflict('Продукция используется в меню мониторов и не может быть удалена.', affected);
    await store.deleteProduct(id);
    await activity(store, request, { action: 'catalog.product.deleted', entity_type: 'catalog_product', entity_id: id, message: `Удалена продукция «${product.name}».` });
    response.status(204).end();
  });

  router.get('/packaging', async (_request, response) => response.json(await store.listPackaging()));
  router.post('/packaging', async (request, response) => {
    const packaging = await store.createPackaging(packagingInput(request.body));
    await activity(store, request, { action: 'catalog.packaging.created', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Добавлена тара «${packaging.name}».` });
    response.status(201).json(packaging);
  });
  router.put('/packaging/:id', async (request, response) => {
    const packaging = await store.updatePackaging(positiveId(request.params.id, 'id'), packagingInput(request.body));
    if (!packaging) throw notFound();
    await activity(store, request, { action: 'catalog.packaging.updated', entity_type: 'catalog_packaging', entity_id: packaging.id, message: `Обновлена тара «${packaging.name}».` });
    response.json(packaging);
  });
  router.delete('/packaging/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const packaging = await store.getPackaging(id);
    if (!packaging) throw notFound();
    const affected = await store.screensUsingCatalog('packaging', id);
    if (affected.length) throw conflict('Тара используется в меню мониторов и не может быть удалена.', affected);
    await store.deletePackaging(id);
    await activity(store, request, { action: 'catalog.packaging.deleted', entity_type: 'catalog_packaging', entity_id: id, message: `Удалена тара «${packaging.name}».` });
    response.status(204).end();
  });

  return router;
}
