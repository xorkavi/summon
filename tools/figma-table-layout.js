// ═══════════════════════════════════════════════════════════════════════════════
// FIGMA TABLE LAYOUT — Standardized migration audit table
// ═══════════════════════════════════════════════════════════════════════════════
//
// This script is sent to figma_execute in BATCHES.
// It creates a consistent, repeatable table layout every time.
//
// USAGE: Copy the relevant section and pass to figma_execute with variables filled in.
// Each section is self-contained and idempotent.
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Create page + section + table container
// Run ONCE at the start. Returns the TABLE_CONTAINER_ID used by all subsequent steps.
// ─────────────────────────────────────────────────────────────────────────────

/*
Variables to fill:
  COMPONENT_NAME = "Badge"  (or "Chip", "IconButton", etc.)
*/

// --- figma_execute prompt for Step 1 ---
`
const PAGE_NAME = "${COMPONENT_NAME} Migration Audit";
const SECTION_NAME = "${COMPONENT_NAME} Migration Table";

// Find or create page
let page = figma.root.children.find(p => p.name === PAGE_NAME);
if (!page) {
  page = figma.createPage();
  page.name = PAGE_NAME;
}
await figma.setCurrentPageAsync(page);

// Create section
const section = figma.createSection();
section.name = SECTION_NAME;
section.x = 0;
section.y = 0;
section.resizeWithoutConstraints(1800, 100);

// Create table container frame
const table = figma.createFrame();
table.name = "Table";
table.layoutMode = "VERTICAL";
table.primaryAxisSizingMode = "AUTO";
table.counterAxisSizingMode = "FIXED";
table.resize(1768, 1);
table.primaryAxisSizingMode = "AUTO";
table.itemSpacing = 0;
table.paddingTop = 0;
table.paddingBottom = 0;
table.paddingLeft = 0;
table.paddingRight = 0;
table.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
table.x = 16;
table.y = 60;
section.appendChild(table);

// Create header row
const header = figma.createFrame();
header.name = "Header";
header.layoutMode = "HORIZONTAL";
header.primaryAxisSizingMode = "FIXED";
header.counterAxisSizingMode = "AUTO";
header.resize(1768, 1);
header.primaryAxisSizingMode = "FIXED";
header.counterAxisSizingMode = "AUTO";
header.itemSpacing = 0;
header.paddingTop = 12;
header.paddingBottom = 12;
header.paddingLeft = 16;
header.paddingRight = 16;
header.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 } }];

const COL_WIDTHS = [320, 220, 200, 280, 160, 220];
const COL_NAMES = [
  "Component Screenshot",
  "Usage in File and Line",
  "Variant + props (old)",
  "Usage Context",
  "Remapped to component",
  "Variant + props (new)"
];

for (let i = 0; i < COL_NAMES.length; i++) {
  const cell = figma.createFrame();
  cell.name = "HeaderCell-" + i;
  cell.layoutMode = "VERTICAL";
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "FIXED";
  cell.resize(COL_WIDTHS[i], 1);
  cell.counterAxisSizingMode = "FIXED";
  cell.primaryAxisSizingMode = "AUTO";
  cell.paddingLeft = 8;
  cell.paddingRight = 8;
  cell.fills = [];

  const text = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  text.fontName = { family: "Inter", style: "Bold" };
  text.fontSize = 12;
  text.characters = COL_NAMES[i];
  text.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
  cell.appendChild(text);
  header.appendChild(cell);
}

table.appendChild(header);

// Return the table container ID for subsequent batch calls
return JSON.stringify({ tableId: table.id, sectionId: section.id, pageId: page.id });
`

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Create domain header row
// Run ONCE per domain group. Insert between row batches.
// ─────────────────────────────────────────────────────────────────────────────

/*
Variables to fill:
  TABLE_ID = "123:456"  (from Step 1)
  DOMAIN_NAME = "Agent Platform / Agent Studio"
  USAGE_COUNT = 11
*/

// --- figma_execute prompt for Step 2 ---
`
const table = await figma.getNodeByIdAsync("${TABLE_ID}");
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });

const domainHeader = figma.createFrame();
domainHeader.name = "Domain: ${DOMAIN_NAME}";
domainHeader.layoutMode = "HORIZONTAL";
domainHeader.primaryAxisSizingMode = "FIXED";
domainHeader.counterAxisSizingMode = "AUTO";
domainHeader.resize(1768, 1);
domainHeader.primaryAxisSizingMode = "FIXED";
domainHeader.counterAxisSizingMode = "AUTO";
domainHeader.paddingTop = 10;
domainHeader.paddingBottom = 10;
domainHeader.paddingLeft = 16;
domainHeader.paddingRight = 16;
domainHeader.fills = [{ type: "SOLID", color: { r: 0.92, g: 0.92, b: 0.92 } }];

const text = figma.createText();
text.fontName = { family: "Inter", style: "Semi Bold" };
text.fontSize = 13;
text.characters = "${DOMAIN_NAME} (${USAGE_COUNT} usages)";
text.fills = [{ type: "SOLID", color: { r: 0.15, g: 0.15, b: 0.15 } }];
domainHeader.appendChild(text);
table.appendChild(domainHeader);

return JSON.stringify({ domainHeaderId: domainHeader.id });
`

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Create data rows (BATCH of up to 10)
// Run multiple times. Each call creates up to 10 rows.
// Returns image rectangle IDs for subsequent image fill.
// ─────────────────────────────────────────────────────────────────────────────

/*
Variables to fill:
  TABLE_ID = "123:456"
  ROWS = [
    {
      id: 1,
      file: "libs/accounts/.../file.tsx:40",
      oldProps: "variant=neutral, isRounded",
      context: "Account chip wrapper, removable selection chip",
      newComponent: "Chip",
      newProps: "variant=neutral, size=md, removable"
    },
    ...up to 10 rows
  ]
*/

// --- figma_execute prompt for Step 3 ---
`
const table = await figma.getNodeByIdAsync("${TABLE_ID}");
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
await figma.loadFontAsync({ family: "Source Code Pro", style: "Regular" });

const COL_WIDTHS = [320, 220, 200, 280, 160, 220];
const rows = ${JSON.stringify(ROWS)};
const imageRectIds = [];

for (const row of rows) {
  const rowFrame = figma.createFrame();
  rowFrame.name = "Row-" + row.id;
  rowFrame.layoutMode = "HORIZONTAL";
  rowFrame.primaryAxisSizingMode = "FIXED";
  rowFrame.counterAxisSizingMode = "AUTO";
  rowFrame.resize(1768, 1);
  rowFrame.primaryAxisSizingMode = "FIXED";
  rowFrame.counterAxisSizingMode = "AUTO";
  rowFrame.itemSpacing = 0;
  rowFrame.paddingTop = 12;
  rowFrame.paddingBottom = 12;
  rowFrame.paddingLeft = 16;
  rowFrame.paddingRight = 16;
  rowFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  rowFrame.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
  rowFrame.strokeWeight = 1;
  rowFrame.strokeAlign = "INSIDE";
  // Only bottom border
  rowFrame.strokeTopWeight = 0;
  rowFrame.strokeLeftWeight = 0;
  rowFrame.strokeRightWeight = 0;
  rowFrame.strokeBottomWeight = 1;

  // Col 0: Screenshot placeholder (image rectangle)
  const imgCell = figma.createFrame();
  imgCell.name = "ImgCell-" + row.id;
  imgCell.layoutMode = "VERTICAL";
  imgCell.primaryAxisSizingMode = "FIXED";
  imgCell.counterAxisSizingMode = "FIXED";
  imgCell.resize(COL_WIDTHS[0], 200);
  imgCell.paddingLeft = 8;
  imgCell.paddingRight = 8;
  imgCell.fills = [];

  const imgRect = figma.createRectangle();
  imgRect.name = "img-" + row.id;
  imgRect.resize(304, 190);
  imgRect.cornerRadius = 4;
  imgRect.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.96 } }];
  imgCell.appendChild(imgRect);
  imageRectIds.push({ id: row.id, nodeId: imgRect.id });
  rowFrame.appendChild(imgCell);

  // Col 1-5: Text cells
  const cellData = [
    { text: row.file, font: "Source Code Pro", style: "Regular", size: 11 },
    { text: row.oldProps, font: "Inter", style: "Regular", size: 12 },
    { text: row.context, font: "Inter", style: "Regular", size: 12 },
    { text: row.newComponent, font: "Inter", style: "Bold", size: 13 },
    { text: row.newProps, font: "Inter", style: "Regular", size: 12 },
  ];

  for (let i = 0; i < cellData.length; i++) {
    const cell = figma.createFrame();
    cell.name = "Cell-" + row.id + "-" + (i + 1);
    cell.layoutMode = "VERTICAL";
    cell.primaryAxisSizingMode = "AUTO";
    cell.counterAxisSizingMode = "FIXED";
    cell.resize(COL_WIDTHS[i + 1], 1);
    cell.counterAxisSizingMode = "FIXED";
    cell.primaryAxisSizingMode = "AUTO";
    cell.paddingLeft = 8;
    cell.paddingRight = 8;
    cell.paddingTop = 4;
    cell.fills = [];

    const fontToLoad = { family: cellData[i].font, style: cellData[i].style };
    await figma.loadFontAsync(fontToLoad);

    const text = figma.createText();
    text.fontName = fontToLoad;
    text.fontSize = cellData[i].size;
    text.characters = cellData[i].text || "—";
    text.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
    text.layoutSizingHorizontal = "FILL";
    cell.appendChild(text);
    rowFrame.appendChild(cell);
  }

  table.appendChild(rowFrame);
}

return JSON.stringify({ imageRectIds });
`

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Apply image fills
// After uploading each screenshot via figma_set_image_fill to a temp rect,
// read the hash and apply to the actual row's image rectangle.
// Run ONCE per batch of images.
// ─────────────────────────────────────────────────────────────────────────────

/*
Variables to fill:
  IMAGE_MAPPINGS = [
    { targetNodeId: "789:012", imageHash: "abc123..." },
    ...
  ]
*/

// --- figma_execute prompt for Step 4 ---
`
const mappings = ${JSON.stringify(IMAGE_MAPPINGS)};

for (const m of mappings) {
  const node = await figma.getNodeByIdAsync(m.targetNodeId);
  if (node && "fills" in node) {
    node.fills = [{ type: "IMAGE", scaleMode: "FIT", imageHash: m.imageHash }];
  }
}

return JSON.stringify({ applied: mappings.length });
`

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: Final resize pass
// After all rows are inserted, resize the section to fit.
// ─────────────────────────────────────────────────────────────────────────────

/*
Variables to fill:
  SECTION_ID = "123:789"
  TABLE_ID = "123:456"
*/

// --- figma_execute prompt for Step 5 ---
`
const section = await figma.getNodeByIdAsync("${SECTION_ID}");
const table = await figma.getNodeByIdAsync("${TABLE_ID}");

if (table && section) {
  // Table auto-sizes vertically. Section wraps it.
  const bounds = table.absoluteBoundingBox;
  if (bounds) {
    section.resizeWithoutConstraints(
      Math.max(bounds.width + 32, 1800),
      bounds.height + 80
    );
  }
}

return JSON.stringify({ done: true });
`
