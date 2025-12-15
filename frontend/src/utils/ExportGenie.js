import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import axios from 'axios';

// --- ICONS ---
const ICONS = {
    folder: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-400"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
    file: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    logo: `<span style="font-size: 24px; line-height: 1;">🧞</span>`,
    alert: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500 mb-2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    download: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
};

// --- STATIC TEMPLATE ---
const VIEWER_TEMPLATE = (title, jsonConfig) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js"></script>
    <style>
        :root { --neon-blue: ${jsonConfig.neonColor}; }
        body { 
            background-color: #050505; color: #e5e7eb; 
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            overflow: hidden; 
        }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0a0a0a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--neon-blue); }
        .model-viewer-container { background: #000; width: 100%; height: 100%; }
        
        /* Tooltip styling */
        .tooltip { position: relative; display: inline-block; }
        .tooltip .tooltiptext {
          visibility: hidden; width: 120px; background-color: #333; color: #fff;
          text-align: center; border-radius: 6px; padding: 5px 0; position: absolute;
          z-index: 1; bottom: 125%; left: 50%; margin-left: -60px; opacity: 0; transition: opacity 0.3s;
          font-size: 10px;
        }
        .tooltip:hover .tooltiptext { visibility: visible; opacity: 1; }
    </style>
</head>
<body class="h-screen w-screen flex flex-col">
    <header class="h-14 border-b border-[#1f2933] flex items-center px-4 justify-between bg-[#050505] shrink-0">
        <div class="flex items-center gap-2">
            ${ICONS.logo}
            <h1 class="text-xl font-bold tracking-wider text-white">
                UNICORN <span style="color: var(--neon-blue)">VISUAL</span> GENIE 
                <span class="text-[10px] uppercase tracking-widest text-gray-500 ml-3 border border-[#333] px-2 py-0.5 rounded">Snapshot</span>
            </h1>
        </div>
        <div class="text-xs text-gray-600 font-mono">${new Date().toISOString().split('T')[0]}</div>
    </header>

    <div class="flex-1 flex overflow-hidden">
        ${jsonConfig.groups.map((group, gIdx) => `
            <div class="flex-1 flex flex-col min-w-[300px] border-r border-[#1f2933] bg-[#0a0a0a]">
                <div class="h-9 bg-[#111] flex items-center justify-between px-3 border-b border-[#333] shrink-0">
                     <span class="text-xs text-gray-500 uppercase tracking-widest font-bold">Group ${gIdx + 1}</span>
                </div>
                <div class="flex-1 overflow-y-auto p-4 bg-[#050505] grid gap-6 content-start pb-24 custom-scrollbar" 
                     style="grid-template-columns: repeat(${jsonConfig.gridCols}, minmax(0, 1fr)); grid-auto-rows: max-content;">
                    
                    ${group.files.length === 0 ? `
                        <div class="col-span-full h-64 flex flex-col items-center justify-center text-gray-700 opacity-50">
                            <p class="text-sm">Empty Group</p>
                        </div>
                    ` : group.files.map(file => `
                        <div class="bg-[#0f1216] rounded-lg border border-[#1f2933] overflow-hidden flex flex-col relative shadow-lg h-auto w-full ${file.is_dir ? 'col-span-full' : 'col-span-1'}">
                            
                            <div class="flex justify-between items-center bg-[#1a2029] px-3 py-2 border-b border-[#1f2933]">
                                <div class="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                                    ${file.is_dir ? ICONS.folder : ICONS.file}
                                    <span class="text-xs font-mono truncate ${file.is_dir ? 'text-orange-300 font-bold' : 'text-gray-300'}" title="${file.name}">${file.name}</span>
                                </div>
                                <a href="assets/${file.safeName}" download="${file.name}" class="text-gray-500 hover:text-white transition-colors tooltip">
                                    ${ICONS.download}
                                    <span class="tooltiptext">Download Asset</span>
                                </a>
                            </div>

                            <div class="relative bg-[#050505] ${file.is_dir ? 'h-auto' : 'h-auto min-h-[100px]'} flex justify-center">
                                ${file.error 
                                    ? `<div class="flex flex-col items-center justify-center p-4 text-center opacity-50">
                                         ${ICONS.alert}
                                         <span class="text-[10px] text-red-400">Export Failed</span>
                                       </div>` 
                                    : renderFileContent(file)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>
`;

const renderFileContent = (file) => {
    const ext = (file.extension || '').toLowerCase();
    const path = `assets/${file.safeName}`;

    // Handle Folders that couldn't be flattened or were empty
    if (file.is_dir) {
        return `<div class="p-4 flex items-center gap-2 text-gray-500"><span class="text-xs">Empty or Unprocessed Directory</span></div>`;
    }

    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
        return `<div class="bg-[#111] p-2 flex justify-center w-full"><img src="${path}" class="max-h-96 object-contain" /></div>`;
    }
    if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) {
        return `<div class="bg-black w-full"><video controls class="w-full max-h-96"><source src="${path}" /></video></div>`;
    }
    if (['.glb', '.gltf'].includes(ext)) {
        return `<div class="w-full h-64 relative bg-gray-900"><model-viewer src="${path}" camera-controls auto-rotate class="model-viewer-container"></model-viewer></div>`;
    }
    if (ext && !['.zip', '.exe', '.bin', ''].includes(ext)) {
        return `<div class="text-xs bg-[#0d1117] w-full max-h-64 overflow-auto custom-scrollbar p-2">
                <iframe src="${path}" class="w-full h-48 border-none bg-transparent" style="color-scheme: dark;"></iframe>
            </div>`;
    }
    return `<div class="p-4 flex items-center gap-4 bg-[#111] rounded w-full"><span class="text-gray-500 text-xs">Binary / Unknown File</span></div>`;
};

// --- HELPER: Recursively Flatten Folders ---
const getFilesFromPath = async (path, apiUrl) => {
    try {
        const res = await axios.get(`${apiUrl}/navigate`, { params: { path, fast: true } });
        const items = res.data.items || [];
        
        let allFiles = [];
        
        for (const item of items) {
            if (item.is_dir) {
                // RECURSION: Dive deeper
                const subFiles = await getFilesFromPath(item.path, apiUrl);
                allFiles = [...allFiles, ...subFiles];
            } else {
                allFiles.push(item);
            }
        }
        return allFiles;
    } catch (e) {
        console.error("Error crawling folder:", path, e);
        return [];
    }
};

export const exportSnapshot = async (groups, gridCols, hue, apiUrl) => {
    const zip = new JSZip();
    const assets = zip.folder("assets");
    const cleanGroups = [];

    console.log("🧞 Pre-processing: Scanning directories...");

    // 1. FLATTEN GROUPS (Resolve all folders to their files)
    const flatGroups = [];
    
    for (const group of groups) {
        let flatFiles = [];
        for (const file of group.files) {
            if (file.is_dir) {
                console.log(`📂 Crawling directory: ${file.name}...`);
                const children = await getFilesFromPath(file.path, apiUrl);
                flatFiles = [...flatFiles, ...children];
            } else {
                flatFiles.push(file);
            }
        }
        flatGroups.push({ ...group, files: flatFiles });
    }

    // 2. CALCULATE TOTALS
    let totalFiles = 0;
    flatGroups.forEach(g => totalFiles += g.files.length);
    let processedCount = 0;

    console.log(`🧞 Starting Download of ${totalFiles} files...`);

    // 3. DOWNLOAD LOOP
    for (const group of flatGroups) {
        const cleanFiles = [];
        for (const file of group.files) {
            
            // Generate safe name with unique ID to prevent collisions
            const safeName = `${Date.now()}_${Math.floor(Math.random() * 1000)}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
            let hasError = false;

            try {
                processedCount++;
                console.log(`[${processedCount}/${totalFiles}] Downloading: ${file.name}`);

                const response = await axios.get(`${apiUrl}/file?path=${encodeURIComponent(file.path)}`, {
                    responseType: 'arraybuffer'
                });
                
                assets.file(safeName, response.data);

            } catch (err) {
                console.error(`❌ Failed to export ${file.name}:`, err.message);
                hasError = true;
            }

            cleanFiles.push({
                name: file.name,
                extension: file.extension || '', 
                is_dir: false, // Everything is now a file
                safeName: safeName,
                path: file.path,
                error: hasError
            });
        }
        cleanGroups.push({ id: group.id, files: cleanFiles });
    }

    console.log("📦 Generating ZIP...");

    const jsonConfig = {
        groups: cleanGroups,
        gridCols: gridCols,
        neonColor: `hsl(${hue}, 100%, 50%)`
    };

    const htmlContent = VIEWER_TEMPLATE("Unicorn Snapshot", jsonConfig);
    zip.file("index.html", htmlContent);

    const now = new Date();
    const dateString = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const filename = `visual_genie_snapshot_${dateString}.zip`;

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, filename);
    
    console.log("✅ Export Complete!");
};