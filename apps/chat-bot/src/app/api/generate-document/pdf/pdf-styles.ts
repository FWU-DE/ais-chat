export const PDF_STYLES = `
@page {
  size: A4;
  margin: 18mm;
}

body {
  color: #1f2933;
  font-family: Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
}

h1 {
  font-size: 20pt;
}

h2 {
  font-size: 16pt;
}

h3 {
  font-size: 13pt;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 12pt 0;
}

th,
td {
  border: 1px solid #9aa5b1;
  padding: 6pt;
  text-align: left;
}

th {
  background: #f1f5f9;
}

img {
  max-width: 100%;
  max-height: 220mm;
  display: block;
  margin: 8pt auto;
}

pre {
  background: #f2f4f7;
  padding: 8pt;
  white-space: pre-wrap;
}

code {
  font-family: monospace;
}

hr {
  border: 0;
  border-top: 1px solid #1f2933;
  margin: 20pt 0 0;
}
`;
