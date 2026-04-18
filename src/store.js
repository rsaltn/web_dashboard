const fs = require("fs");
const path = require("path");
const { dataDir } = require("./config");

function readJson(fileName, fallback = []) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(fileName, data) {
  const filePath = path.join(dataDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function appendRecord(fileName, record) {
  const current = readJson(fileName, []);
  current.push(record);
  writeJson(fileName, current);
  return record;
}

module.exports = { readJson, writeJson, appendRecord };
