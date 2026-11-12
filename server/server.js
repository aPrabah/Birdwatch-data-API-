const express = require('express');
const app = express(); 
const fs = require('fs');
const path = require('path');

app.use(express.json({ limit: '16kb' }));

const listsFile = path.join(__dirname, 'data', 'lists.json');
let listStore = { nextId: 1, lists: [] };

if (fs.existsSync(listsFile)) {
  listStore = JSON.parse(fs.readFileSync(listsFile, 'utf8'));
  if (!Number.isSafeInteger(listStore.nextId) || listStore.nextId < 1 ||
      !Array.isArray(listStore.lists)) {
    throw new Error('Invalid lists.json storage format. Restore the saved data before starting.');
  }
}

// Save to disk before updating memory, so a failed write cannot create a phantom list.
function saveLists(updatedStore) {
  const temporaryFile = listsFile + '.tmp';
  fs.writeFileSync(temporaryFile, JSON.stringify(updatedStore, null, 2), 'utf8');
  fs.renameSync(temporaryFile, listsFile);
  listStore = updatedStore;
}

const birds = require('./data/avilist.json');

app.get('/api', (req, res) => {
  res.json({ message: 'Birdwatching API is running' });
});

app.get('/api/orders', (req, res) => {
  const orders = [];

  for (const id in birds) {
    const order = birds[id].Order;

    if (!orders.includes(order)) {
      orders.push(order);
    }
  }

  orders.sort();
  res.json(orders);
});

app.get('/api/orders/:order/families', (req, res) => {
  const order = req.params.order.trim().slice(0, 100);
  const language = req.query.language === undefined
    ? '0'
    : req.query.language;

  // Validate the order and language.
  if (!/^[a-zA-Z]{4,100}$/.test(order)) {
    return res.status(400).json({
      error: 'Order must contain 4–100 letters.'
    });
  }

  if (language !== '0' && language !== '1') {
    return res.status(400).json({
      error: 'Language must be 0 (Latin) or 1 (English).'
    });
  }

  const families = [];
  let orderFound = false;

  for (const id in birds) {
    const bird = birds[id];

    if (bird.Order.toLowerCase() === order.toLowerCase()) {
      orderFound = true;

      const family = language === '1'
        ? bird.Family_e
        : bird.Family;

      if (!families.includes(family)) {
        families.push(family);
      }
    }
  }

  if (!orderFound) {
    return res.status(404).json({
      error: 'Order not found. Use /api/orders to see valid orders.'
    });
  }

  families.sort();
  res.json(families);
});


app.get('/api/birds/search', (req, res) => {
  const hasName = req.query.name !== undefined;
  const hasFamily = req.query.family !== undefined;
  const hasLocation = req.query.location !== undefined;

  let searchCount = 0;

  if (hasName) searchCount++;
  if (hasFamily) searchCount++;
  if (hasLocation) searchCount++;

  if (searchCount !== 1) {
    return res.status(400).json({
      error: 'Provide exactly one search option: name, family, or location.'
    });
  }

  let input;
  let firstField;
  let secondField;

  if (hasName) {
    input = req.query.name;
    firstField = 'English_name';
    secondField = 'Scientific_name';
  } else if (hasFamily) {
    input = req.query.family;
    firstField = 'Family';
    secondField = 'Family_e';
  } else {
    input = req.query.location;
    firstField = 'Range';
    secondField = 'Locality';
  }

  if (typeof input !== 'string') {
    return res.status(400).json({
      error: 'Search must be a single text value.'
    });
  }

  const searchTerm = input.trim().slice(0, 100).toLowerCase();

  if (searchTerm.length < 4) {
    return res.status(400).json({
      error: 'Search must contain at least 4 characters.'
    });
  }

  const ids = [];

  for (const id in birds) {
    const bird = birds[id];

    const firstValue = bird[firstField];
    const secondValue = bird[secondField];

    const firstMatch =
      typeof firstValue === 'string' &&
      firstValue.toLowerCase().includes(searchTerm);

    const secondMatch =
      typeof secondValue === 'string' &&
      secondValue.toLowerCase().includes(searchTerm);

    if (firstMatch || secondMatch) {
      ids.push(id);
    }
  }

  res.json(ids);
});

 



app.get('/api/birds/:id', (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  // A hexadecimal ID uses digits 0–9 and letters A–F.
  if (!/^[0-9A-F]{1,16}$/.test(id)) {
    return res.status(400).json({
      error: 'Bird ID must contain 1–16 hexadecimal characters (0–9, A–F).'
    });
  }

  const bird = birds[id];

  if (bird === undefined) {
    return res.status(404).json({
      error: 'No bird was found with that ID. Check the ID and try again.'
    });
  }

  res.json(bird);
});

app.get('/api/birds/:id/ebird', (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  if (!/^[0-9A-F]{1,16}$/.test(id)) {
    return res.status(400).json({
      error: 'Bird ID must contain 1–16 hexadecimal characters (0–9, A–F).'
    });
  }

  const bird = birds[id];

  if (bird === undefined) {
    return res.status(404).json({
      error: 'No bird was found with that ID. Check the ID and try again.'
    });
  }

  if (typeof bird.eBird !== 'string' || bird.eBird.trim() === '') {
    return res.status(404).json({
      error: 'This bird does not have an eBird link available.'
    });
  }

  const url = 'https://ebird.org/species/'
    + encodeURIComponent(bird.eBird.trim());

  res.json({ url: url });
});


app.get('/api/iucn/:code/birds', (req, res) => {
  const code = req.params.code.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return res.status(400).json({
      error: 'IUCN code must contain exactly two letters, such as LC or EN.'
    });
  }

  const ids = [];

  for (const id in birds) {
    const bird = birds[id];

    if (
      typeof bird.IUCN === 'string' &&
      bird.IUCN.toUpperCase() === code
    ) {
      ids.push(id);
    }
  }

  res.json(ids);
}); 

app.get('/api/birds', (req, res) => {
  // Both query parameters are required and must be strings.
  if (
    typeof req.query.order !== 'string' ||
    typeof req.query.family !== 'string'
  ) {
    return res.status(400).json({
      error: 'Provide both order and family, for example: ?order=Passeriformes&family=Dicaeidae'
    });
  }

  const order = req.query.order.trim().slice(0, 100);
  const family = req.query.family.trim().slice(0, 100);

  if (
    !/^[a-zA-Z]{4,100}$/.test(order) ||
    !/^[a-zA-Z]{4,100}$/.test(family)
  ) {
    return res.status(400).json({
      error: 'Order and Latin family name must each contain 4–100 letters.'
    });
  }

  const ids = [];

  for (const id in birds) {
    const bird = birds[id];

    if (
      bird.Order.toLowerCase() === order.toLowerCase() &&
      bird.Family.toLowerCase() === family.toLowerCase()
    ) {
      ids.push(id);
    }
  }

  res.json(ids);
});


app.post('/api/lists', (req, res) => {
  const body = req.body;

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Send a JSON object containing a list name.' });
  }

  if (typeof body.name !== 'string') {
    return res.status(400).json({ error: 'Provide a list name as text.' });
  }

  const name = Array.from(body.name.trim()).slice(0, 20).join('');
  if (name.length === 0) {
    return res.status(400).json({ error: 'List name cannot be empty.' });
  }

  const isPrivate = body.private === undefined ? true : body.private;
  if (typeof isPrivate !== 'boolean') {
    return res.status(400).json({ error: 'Private must be true or false, without quotation marks.' });
  }

  const nameExists = listStore.lists.some(list =>
    list.name.toLowerCase() === name.toLowerCase()
  );
  if (nameExists) {
    return res.status(409).json({ error: 'That list name already exists. Choose a different name.' });
  }

  if (listStore.nextId >= Number.MAX_SAFE_INTEGER) {
    return res.status(500).json({ error: 'No more list IDs are available.' });
  }

  const now = new Date().toISOString();
  const newList = {
    id: listStore.nextId,
    name: name,
    createdAt: now,
    modifiedAt: now,
    comment: '',
    ratings: [],
    private: isPrivate,
    birdIds: []
  };

  const updatedStore = {
    nextId: listStore.nextId + 1,
    lists: [...listStore.lists, newList]
  };

  try {
    saveLists(updatedStore);
  } catch (error) {
    console.error('Failed to save list:', error);
    return res.status(500).json({ error: 'The list could not be saved. Please try again.' });
  }

  res.status(201).json(newList);
});

// Shared validation for routes that operate on one saved list.
function findList(req, res, next) {
  const idText = req.params.id;
  const id = Number(idText);

  if (!/^[0-9]{1,16}$/.test(idText) || !Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'List ID must be a positive safe integer.' });
  }

  const list = listStore.lists.find(item => item.id === id);
  if (list === undefined) {
    return res.status(404).json({ error: 'No list was found with that ID.' });
  }

  req.birdingList = list;
  next();
}

function validateBirdIds(req, res, next) {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body) ||
      !Array.isArray(body.birdIds) || body.birdIds.length < 1 || body.birdIds.length > 100) {
    return res.status(400).json({ error: 'Send birdIds as an array containing 1 to 100 bird ID strings.' });
  }

  const ids = [];
  for (const value of body.birdIds) {
    if (typeof value !== 'string' || !/^[0-9A-Fa-f]{1,16}$/.test(value.trim())) {
      return res.status(400).json({ error: 'Each bird ID must be a string of 1 to 16 hexadecimal characters.' });
    }
    const id = value.trim().toUpperCase();
    if (!ids.includes(id)) ids.push(id);
  }

  req.validatedBirdIds = ids;
  next();
}

function saveListChanges(list, changes, res) {
  const updatedList = {
    ...list,
    ...changes,
    modifiedAt: new Date().toISOString()
  };
  const updatedStore = {
    ...listStore,
    lists: listStore.lists.map(item => item.id === list.id ? updatedList : item)
  };

  try {
    saveLists(updatedStore);
  } catch (error) {
    console.error('Failed to update list:', error);
    return res.status(500).json({ error: 'The list could not be saved. Please try again.' });
  }
  return res.json(updatedList);
}

app.get('/api/lists', (req, res) => {
  res.json(listStore.lists);
});

app.get('/api/lists/:id', findList, (req, res) => {
  res.json(req.birdingList);
});

app.post('/api/lists/:id/birds', findList, validateBirdIds, (req, res) => {
  const list = req.birdingList;

  // Validate the entire request before making any changes.
  for (const id of req.validatedBirdIds) {
    if (!Object.prototype.hasOwnProperty.call(birds, id)) {
      return res.status(404).json({ error: 'Bird ID ' + id + ' does not exist. No birds were added.' });
    }
  }

  const birdIds = [...list.birdIds];
  for (const id of req.validatedBirdIds) {
    if (!birdIds.includes(id)) birdIds.push(id);
  }

  if (birdIds.length > 100) {
    return res.status(400).json({ error: 'A list can contain at most 100 birds. Remove birds or add fewer.' });
  }
  if (birdIds.length === list.birdIds.length) return res.json(list);

  saveListChanges(list, { birdIds: birdIds }, res);
});

app.delete('/api/lists/:id/birds', findList, validateBirdIds, (req, res) => {
  const list = req.birdingList;
  const birdIds = list.birdIds.filter(id => !req.validatedBirdIds.includes(id));

  // Repeating a removal is safe and leaves the list unchanged.
  if (birdIds.length === list.birdIds.length) return res.json(list);
  saveListChanges(list, { birdIds: birdIds }, res);
});

function requireListBody(req, res, next) {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Send a JSON object containing the value to update.' });
  }
  next();
}

app.put('/api/lists/:id/comment', findList, requireListBody, (req, res) => {
  if (typeof req.body.comment !== 'string') {
    return res.status(400).json({ error: 'Comment must be text. Send an empty string to clear it.' });
  }

  // Store Unicode text; the client must display it using createTextNode().
  const comment = Array.from(req.body.comment).slice(0, 500).join('');
  if (comment === req.birdingList.comment) return res.json(req.birdingList);
  saveListChanges(req.birdingList, { comment: comment }, res);
});

app.post('/api/lists/:id/ratings', findList, requireListBody, (req, res) => {
  const rating = req.body.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
  }

  const ratings = [...req.birdingList.ratings, rating];
  saveListChanges(req.birdingList, { ratings: ratings }, res);
});

app.put('/api/lists/:id/privacy', findList, requireListBody, (req, res) => {
  if (typeof req.body.private !== 'boolean') {
    return res.status(400).json({ error: 'Private must be true or false, without quotation marks.' });
  }

  if (req.body.private === req.birdingList.private) return res.json(req.birdingList);
  saveListChanges(req.birdingList, { private: req.body.private }, res);
});

app.delete('/api/lists/:id', findList, (req, res) => {
  const updatedStore = {
    ...listStore,
    lists: listStore.lists.filter(list => list.id !== req.birdingList.id)
  };

  try {
    saveLists(updatedStore);
  } catch (error) {
    console.error('Failed to delete list:', error);
    return res.status(500).json({ error: 'The list could not be deleted. Please try again.' });
  }
  res.json({ message: 'List deleted.', id: req.birdingList.id });
});

// Serve the client and API through the same host and port.
app.use(express.static(path.join(__dirname, '..', 'client')));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found. Check the URL and HTTP method.' });
});

// Return JSON for malformed or oversized request bodies too.
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body exceeds the 16 KB limit.' });
  }
  console.error('Request failed:', error);
  res.status(500).json({ error: 'The server could not complete the request. Please try again.' });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
