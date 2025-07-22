const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const name = req.body.name.trim();
    const dir = path.join(__dirname, 'labeled_images', name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const name = req.body.name.trim();
    const dir = path.join(__dirname, 'labeled_images', name);
    const existing = fs.readdirSync(dir).filter(f => f.endsWith('.jpg'));
    const nextIndex = existing.length < 2 ? existing.length + 1 : 2; // Save max 2 images
    cb(null, `${nextIndex}.jpg`);
  }
});

const upload = multer({ storage: storage });

app.post('/register', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('❌ No file uploaded.');
  console.log(`✅ Image saved to ${req.file.path}`);
  res.send('Saved successfully');
});

app.get('/known-names', (req, res) => {
  const dirPath = path.join(__dirname, 'labeled_images');
  if (!fs.existsSync(dirPath)) return res.json([]);
  const folders = fs.readdirSync(dirPath).filter(f => fs.statSync(path.join(dirPath, f)).isDirectory());
  res.json(folders);
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
