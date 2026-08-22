import express from 'express';
import { packagingInput, positiveId, productInput } from '../../contracts/input.js';
import { importProductsCsv, productsToCsv } from '../../services/catalog-csv-service.js';
import { activity, conflict, notFound } from '../helpers.js';

function csvImportSource(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === 'string') return body;
  return body?.csv;
}

export function createCatalogRouter({ store, config }) {
  const router = express.Router();
  const parseCsvUpload = express.raw({
    type: ['application/octet-stream', 'text/csv', 'text/plain'],
    limit: config.catalogCsvMaxBytes
  });

  router.get('/products', async (_request, response) => response.json(await store.listProducts()));
  router.get('/products/export.csv', async (_request, response) => {
    const csv = productsToCsv(await store.listProducts());
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    response.setHeader('Cache-Control', 'no-store');
    response.send(csv);
  });
  router.post('/products/import', parseCsvUpload, async (request, response) => {
    const result = await importProductsCsv(store, csvImportSource(request.body));
    await activity(store, request, {
      action: 'catalog.products.imported',
      entity_type: 'catalog_product',
      entity_id: null,
      message: `Импортирована продукция из CSV: создано ${result.created}, обновлено ${result.updated}.`
    });
    response.json(result);
  });
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
