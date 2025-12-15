import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import axios from 'axios';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Folder, File, ChevronLeft, Layout, X, FileText, Image, Film, Box, ChevronRight, ChevronDown, Settings, Grid, RotateCw } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import * as XLSX from 'xlsx'; // Import SheetJS
import { exportSnapshot } from './utils/ExportGenie';
import { Download } from 'lucide-react'; // Import Icon

// --- 3D IMPORTS ---
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, Bounds, Center } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader';
import * as THREE from 'three';

// const API_URL = "http://localhost:8000/api";
// const API_URL = "/api";

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const VID_EXT = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const MESH_EXT = ['.obj', '.ply', '.stl', '.glb', '.gltf', '.off']; // Added .off
const CODE_EXT = ['.py', '.c', '.cpp', '.cu', '.json', '.txt', '.csv', '.md', '.sh', '.yaml', '.xml', '.log', '.css', '.js', '.jsx', '.ts', '.tsx', '.html', '.sql', '.rs', '.go'];
const BINARY_EXT = ['.xlsx', '.pdf', '.zip', '.exe', '.dll'];
const EXCEL_EXT = ['.xlsx', '.xls', '.csv']; // Dedicated Excel list

// --- UTILS: Custom OFF Parser ---
const parseOFF = (data) => {
  // 1. Remove comments (#...) and split into tokens by any whitespace
  const tokens = data
    .replace(/#.*/g, '')
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0);

  // 2. Validate Header
  if (tokens.length === 0 || tokens[0] !== 'OFF') {
    console.error("Invalid OFF file");
    return new THREE.BufferGeometry();
  }

  let i = 1; // Token index
  const numV = parseInt(tokens[i++]); // Vertex count
  const numF = parseInt(tokens[i++]); // Face count
  i++; // Skip edge count (usually 0)

  // 3. Parse Vertices
  const vertices = [];
  for (let j = 0; j < numV; j++) {
    vertices.push(parseFloat(tokens[i++])); // x
    vertices.push(parseFloat(tokens[i++])); // y
    vertices.push(parseFloat(tokens[i++])); // z
  }

  // 4. Parse Faces (Indices) with Triangulation
  const indices = [];
  for (let j = 0; j < numF; j++) {
    const faceVerts = parseInt(tokens[i++]); // Number of vertices in this face (3, 4, etc.)

    if (faceVerts === 3) {
      // Triangle
      indices.push(parseInt(tokens[i++]), parseInt(tokens[i++]), parseInt(tokens[i++]));
    } else if (faceVerts === 4) {
      // Quad -> Split into 2 triangles (0-1-2 and 0-2-3)
      const a = parseInt(tokens[i++]);
      const b = parseInt(tokens[i++]);
      const c = parseInt(tokens[i++]);
      const d = parseInt(tokens[i++]);
      indices.push(a, b, c);
      indices.push(a, c, d);
    } else {
      // Polygon (Fan triangulation): Fix first vertex, fan out to others
      const first = parseInt(tokens[i++]);
      let prev = parseInt(tokens[i++]);
      for (let k = 2; k < faceVerts; k++) {
        const curr = parseInt(tokens[i++]);
        indices.push(first, prev, curr);
        prev = curr;
      }
    }
  }

  // 5. Build Geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.center(); // Centers the mesh geometry automatically
  return geometry;
};

// --- SUB-COMPONENT: Excel Viewer (Dark Mode) ---
function ExcelViewer({ url }) {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    axios.get(url, { responseType: 'arraybuffer' })
      .then(res => {
        if (!mounted) return;
        try {
          const workbook = XLSX.read(res.data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          setData(jsonData.slice(0, 100)); // Limit to 100 rows
        } catch (e) {
          setError("Failed to parse Excel file");
        }
      })
      .catch(e => mounted && setError(e.message));
    return () => { mounted = false; };
  }, [url]);

  if (error) return <div className="p-4 text-red-400 text-xs font-mono">{error}</div>;

  return (
    // Updated container bg to dark
    <div className="overflow-auto max-h-64 custom-scrollbar bg-[#0d1117] rounded border border-[#333]">
      <table className="min-w-full text-xs text-left text-gray-300 font-mono">
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              // Darker background for header row, subtle hover for others
              className={`border-b border-[#333] ${i === 0 ? 'bg-[#161b22] text-white font-bold' : 'hover:bg-[#1f2933]'}`}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 border-r border-[#333] last:border-r-0 whitespace-nowrap max-w-[200px] truncate"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- SUB-COMPONENT: Code Viewer ---
function CodeViewer({ url, ext }) {
  console.log(`url ${url}`)

  const [content, setContent] = useState("Loading...");

  useEffect(() => {
    let mounted = true;
    axios.get(url, { transformResponse: [data => data] })
      .then(res => {
        if (mounted) {
          const text = typeof res.data === 'object' ? JSON.stringify(res.data, null, 2) : res.data;
          setContent(text);
        }
      })
      .catch(err => mounted && setContent("Error: " + err.message));
    return () => { mounted = false; };
  }, [url]);

  const getLang = (ext) => {
    const map = {
      '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.py': 'python',
      '.c': 'c', '.cpp': 'cpp', '.cu': 'cpp', '.sh': 'bash',
      '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown',
      '.yaml': 'yaml', '.xml': 'xml', '.sql': 'sql', '.rs': 'rust', '.go': 'go'
    };
    return map[ext] || 'text';
  };

  if (ext === '.md') {
    return (
      <div className="p-4 text-xs prose prose-invert max-w-none bg-[#0d1117] rounded max-h-64 overflow-y-auto custom-scrollbar">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="text-xs bg-[#0d1117] rounded overflow-hidden">
      <div className="max-h-64 overflow-auto custom-scrollbar px-2 py-2">
        <SyntaxHighlighter
          language={getLang(ext)}
          style={atomDark}
          customStyle={{ background: 'transparent', margin: 0, padding: 0 }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// --- HELPER: Stats Calculator ---
const calculateStats = (object) => {
  let vCount = 0;
  let fCount = 0;
  object.traverse((child) => {
    if (child.isMesh) {
      if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: '#2b85e4', side: THREE.DoubleSide });
      vCount += child.geometry.attributes.position.count;
      if (child.geometry.index) {
        fCount += child.geometry.index.count / 3;
      } else {
        fCount += child.geometry.attributes.position.count / 3;
      }
    }
  });
  return { verts: vCount, faces: Math.floor(fCount) };
};

// --- 3D SUB-COMPONENTS ---
function GltfModel({ url, setStats }) {
  const gltf = useGLTF(url);
  useEffect(() => { if (gltf.scene) setStats(calculateStats(gltf.scene)); }, [gltf.scene, setStats]);
  return <primitive object={gltf.scene} />;
}

function StandardModel({ url, loader, setStats }) {
  const object = useLoader(loader, url);
  const mesh = useMemo(() => {
    if (object.isBufferGeometry) return new THREE.Mesh(object, new THREE.MeshStandardMaterial({ color: '#2b85e4' }));
    return object;
  }, [object]);
  useEffect(() => { if (mesh) setStats(calculateStats(mesh)); }, [mesh, setStats]);
  return <primitive object={mesh} />;
}

function OffModel({ url, setStats }) {
  const [geometry, setGeometry] = useState(null);
  useEffect(() => {
    axios.get(url).then(res => {
      const geo = parseOFF(res.data);
      setGeometry(geo);
      setStats({ verts: geo.attributes.position.count, faces: geo.index ? geo.index.count / 3 : 0 });
    });
  }, [url, setStats]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#2b85e4" side={THREE.DoubleSide} />
    </mesh>
  );
}

// --- MAIN MESH VIEWER ---
function MeshViewer({ url, ext }) {
  const [stats, setStats] = useState({ verts: 0, faces: 0 });

  // Determine Type
  const isGltf = ext === '.glb' || ext === '.gltf';
  const isOff = ext === '.off';

  const LoaderClass = useMemo(() => {
    if (isGltf || isOff) return null;
    return { '.obj': OBJLoader, '.stl': STLLoader, '.ply': PLYLoader }[ext];
  }, [ext, isGltf, isOff]);

  return (
    <div className="w-full h-64 relative bg-gray-900 rounded overflow-hidden">
      <div className="absolute top-2 left-2 z-10 bg-black/50 backdrop-blur text-[10px] p-2 rounded border border-gray-700 font-mono text-green-400 pointer-events-none select-none">
        <div>VERTS: {stats.verts.toLocaleString()}</div>
        <div>FACES: {stats.faces.toLocaleString()}</div>
      </div>

      <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, position: [0, 0, 10] }}> {/* Move camera back initially */}
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
        <Environment preset="city" />

        {/* FIX: Bounds with margin > 1 adds padding (makes model appear smaller) */}
        <Bounds fit clip observe margin={2.0}>
          <Center>
            <Suspense fallback={null}>
              {isGltf ? <GltfModel url={url} setStats={setStats} /> :
                isOff ? <OffModel url={url} setStats={setStats} /> :
                  LoaderClass && <StandardModel url={url} loader={LoaderClass} setStats={setStats} />
              }
            </Suspense>
          </Center>
        </Bounds>

        <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}

// --- VISUALIZER FACTORY ---
function VisualizerFactory({ file, gridCols, refreshKey, apiUrl }) {
  if (file.is_dir) {
    return (
      <div className="h-auto max-h-[600px] overflow-y-auto custom-scrollbar bg-[#0a0f14] p-2 border-l-2 border-[#1f2933]">
        {/* Pass refreshKey down so folders reload too */}
        <FolderTree apiUrl={apiUrl} path={file.path} gridCols={gridCols} key={refreshKey} />
      </div>
    );
  }

  const ext = file.extension.toLowerCase();

  // 2. Append refreshKey to the URLs as a query parameter
  const cacheBuster = refreshKey ? `&_t=${refreshKey}` : '';
  const rawUrl = `${apiUrl}/file?path=${encodeURIComponent(file.path)}${cacheBuster}`;
  const streamUrl = `${apiUrl}/stream?path=${encodeURIComponent(file.path)}${cacheBuster}`;

  if (IMG_EXT.includes(ext)) {
    return <div className="bg-[#111] p-2 flex justify-center"><img src={rawUrl} alt={file.name} className="max-h-96 object-contain" /></div>;
  }

  if (VID_EXT.includes(ext)) {
    // Key added to video to force reload of source
    return <div className="bg-black"><video key={refreshKey} controls className="w-full max-h-96"><source src={streamUrl} /></video></div>;
  }

  if (MESH_EXT.includes(ext)) {
    return <MeshViewer url={rawUrl} ext={ext} />;
  }

  if (EXCEL_EXT.includes(ext)) {
    return <ExcelViewer url={rawUrl} />;
  }

  if (CODE_EXT.includes(ext) && !BINARY_EXT.includes(ext)) {
    return <CodeViewer url={rawUrl} ext={ext} />;
  }

  return <FallbackViewer file={file} apiUrl={apiUrl} />;
}

// --- SUB-COMPONENT: Smart Fallback Viewer ---
function FallbackViewer({ file, apiUrl }) {
  const [size, setSize] = useState(file.size);
  const [status, setStatus] = useState(file.size > 0 ? 'ready' : 'loading');
  const [isDownloading, setIsDownloading] = useState(false);

  // Existing metadata fetch logic
  useEffect(() => {
    if (!file.size) {
      setStatus('loading');
      const controller = new AbortController();
      axios.get(`${apiUrl}/metadata`, { params: { path: file.path }, signal: controller.signal })
        .then(res => {
          if (res.data && res.data.size !== undefined) {
            setSize(res.data.size);
            setStatus('ready');
          } else {
            setStatus('unknown');
          }
        })
        .catch(err => {
          if (axios.isCancel(err)) return;
          setStatus('error');
        });
      return () => controller.abort();
    } else {
      setSize(file.size);
      setStatus('ready');
    }
  }, [file]);

  // New Download Logic
  const handleDownload = async (e) => {
    e.stopPropagation(); // Prevent interfering with any parent clicks
    setIsDownloading(true);
    try {
      const response = await axios.get(`${apiUrl}/file`, {
        params: { path: file.path },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setIsDownloading(false);
    }
  };

  let displaySize = status === 'ready' ? (size / 1024).toFixed(2) + ' KB' : (status === 'loading' ? 'Calculating...' : 'Unknown');

  return (
    <div className="p-4 flex items-center gap-4 bg-[#111] rounded border border-[#222]">
      <FileText size={24} className="text-gray-600 shrink-0" /> {/* Added shrink-0 just in case */}

      <div className="text-xs">
        <div className="text-white font-mono">{file.name}</div>
        <div className="text-gray-500 font-mono">{displaySize}</div>
      </div>

      {/* --- NEW DOWNLOAD BUTTON (Pushed to the right) --- */}
      {/* <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="ml-auto p-2 text-gray-500 hover:text-[var(--neon-blue)] hover:bg-[#1f2933] rounded transition-all"
        title="Download"
      >
        {isDownloading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download size={16} />
        )}
      </button> */}
    </div>
  );
}

function FolderTree({ path, apiUrl, level = 0, gridCols = 1 }) {
  console.log(`api url ${apiUrl}`);

  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(level === 0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (level === 0) {
      const load = async () => {
        setLoading(true);
        try {
          const res = await axios.get(`${apiUrl}/navigate`, { params: { path, fast: true } });
          setItems(res.data.items);
          setLoaded(true);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
      };
      load();
    }
  }, [level, path]);

  const handleToggle = async () => {
    if (!expanded && !loaded) {
      setLoading(true);
      try {
        const res = await axios.get(`${apiUrl}/navigate`, { params: { path, fast: true } });
        setItems(res.data.items);
        setLoaded(true);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    setExpanded(!expanded);
  };

  const folders = items.filter((i) => i.is_dir);
  const files = items.filter((i) => !i.is_dir);

  return (
    <div className="text-sm font-mono select-none w-full">
      {level !== 0 && (
        <div
          onClick={handleToggle}
          className="flex items-center gap-2 py-1 px-2 mb-1 hover:bg-[#1a232e] cursor-pointer text-gray-400 hover:text-white transition-colors rounded"
          style={{ marginLeft: `${level * 12}px` }}
        >
          {loading ? (
            <div className="w-3 h-3 border-2 border-[var(--neon-blue)] border-t-transparent rounded-full animate-spin" />
          ) : expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}

          <Folder size={14} className="text-orange-400" />
          <span className="truncate font-bold text-gray-300">
            {path.split("/").pop()}
          </span>
        </div>
      )}

      {expanded && (
        <div className="w-full mt-1">
          <div>
            {folders.map((folder) => (
              <FolderTree
                apiUrl={apiUrl}
                key={folder.path}
                path={folder.path}
                level={level + 1}
                gridCols={gridCols}
              />
            ))}
          </div>

          {files.length > 0 && (
            <div
              className="grid gap-4 mt-2 pr-2"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                marginLeft: `${(level + 1) * 12}px`,
                gridAutoRows: 'max-content'
              }}
            >
              {files.map((item) => (
                <div key={item.path} className="flex flex-col w-full">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                    <FileIcon isDir={false} ext={item.extension} size={12} />
                    <span className="truncate">{item.name}</span>
                  </div>

                  <div className="pl-2 border-l border-[#333] w-full">
                    <VisualizerFactory apiUrl={apiUrl} file={item} gridCols={gridCols} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon({ isDir, ext, size = 18 }) {
  // Added "shrink-0" to all className strings below:
  if (isDir) return <Folder className="text-orange-400 shrink-0" size={size} />;

  const e = ext.toLowerCase();
  if (IMG_EXT.includes(e)) return <Image className="text-purple-400 shrink-0" size={size} />;
  if (VID_EXT.includes(e)) return <Film className="text-red-400 shrink-0" size={size} />;
  if (MESH_EXT.includes(e)) return <Box className="text-green-400 shrink-0" size={size} />;
  if (EXCEL_EXT.includes(e)) return <Grid className="text-green-600 shrink-0" size={size} />;
  if (CODE_EXT.includes(e)) return <FileText className="text-blue-400 shrink-0" size={size} />;

  return <File className="text-gray-400 shrink-0" size={size} />;
}

// --- DOCKED SETTINGS WIDGET ---
const DockedSettings = ({ gridCols, setGridCols, hue, setHue, port, setPort }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="fixed bottom-4 left-4 z-50 flex items-end">
      {/* ... (Your existing <style> tag remains here) ... */}
      <style>{`
        .hue-range {
          -webkit-appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
          outline: none;
        }
        .hue-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: hsl(${hue}, 100%, 50%);
          border: 2px solid white;
          box-shadow: 0 0 10px hsl(${hue}, 100%, 50%);
          cursor: pointer;
          margin-top: 0px;
        }
        .hue-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: hsl(${hue}, 100%, 50%);
          border: 2px solid white;
          box-shadow: 0 0 10px hsl(${hue}, 100%, 50%);
          cursor: pointer;
          border: none;
        }
      `}</style>

      <div
        className={`bg-[#0a0f14] border border-[#333] shadow-2xl rounded-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-in-out origin-bottom-left
          ${isOpen ? 'w-64 h-auto opacity-100 mb-2 scale-100' : 'w-0 h-0 opacity-0 scale-95'}
        `}
      >
        <div className="h-10 bg-[#111] flex items-center justify-between px-3 border-b border-[#333]">
          <span className="text-xs font-bold text-gray-300">SYSTEM CONFIG</span>
          <X size={14} className="text-gray-500 hover:text-white cursor-pointer" onClick={() => setIsOpen(false)} />
        </div>

        <div className="p-4 space-y-5"> {/* Increased space-y for better separation */}

          {/* --- NEW PORT SELECTION --- */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Server Port</span>
              {/* Visual feedback of the current active port */}
              <span className="text-[var(--neon-blue)] font-mono">:{port}</span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="1024"
                max="65535"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full bg-[#161b22] text-white border border-[#333] rounded px-2 py-1 text-xs font-mono focus:border-[var(--neon-blue)] focus:outline-none transition-colors appearance-none"
                placeholder="8000"
              />
              {/* Small indicator dot */}
              {/* <div className="absolute right-2 top-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#0f0]"></div> */}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Grid Layout</span>
              <span className="text-[var(--neon-blue)]">{gridCols} Columns</span>
            </div>
            <input
              type="range" min="1" max="4" step="1"
              value={gridCols} onChange={(e) => setGridCols(parseInt(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--neon-blue)]"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-mono">
              <span>List</span>
              <span>Gallery</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Neon Hue</span>
            </div>
            <input
              type="range" min="0" max="360"
              value={hue} onChange={(e) => setHue(parseInt(e.target.value))}
              className="hue-range"
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center border transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)]
          ${isOpen
            ? 'w-10 h-10 rounded-full bg-[#111] border-[#333] text-[var(--neon-blue)] ml-3 opacity-100'
            : 'w-14 h-14 rounded-full bg-[#050505] border-[var(--neon-blue)] text-white hover:scale-110 opacity-50 hover:opacity-100'
          }
        `}
      >
        <Settings size={isOpen ? 18 : 24} className={`transition-transform duration-500 ${isOpen ? 'rotate-90' : 'animate-spin-slow'}`} />
      </button>
    </div>
  );
};

// --- MAIN APP ---
export default function VisualGenie() {
  const [currentPath, setCurrentPath] = useState(".");
  const [fileList, setFileList] = useState([]);
  const [pathInput, setPathInput] = useState(".");
  const [groups, setGroups] = useState([{ id: Date.now(), files: [], refreshKey: 0 }]); // Add refreshKey to initial state

  const [gridCols, setGridCols] = useState(1);
  const [hue, setHue] = useState(180);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false); // Flag to prevent overwriting server data
  const [downloadingPaths, setDownloadingPaths] = useState(new Set());
  const [port, setPort] = useState(8000); // Default to 8000

  const apiUrl = `http://localhost:${port}/api`;

  const handleDownload = async (file) => {
    // 1. Mark as downloading (starts spinner)
    setDownloadingPaths(prev => {
      const next = new Set(prev);
      next.add(file.path);
      return next;
    });

    try {
      // 2. ACTIVELY FETCH the binary data (Blob) from the server
      const response = await axios.get(`${apiUrl}/file`, {
        params: { path: file.path },
        responseType: 'blob', // Critical: treats response as binary file
      });

      // 3. Create a temporary download link and click it programmatically
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name); // Force the filename
      document.body.appendChild(link);
      link.click();

      // 4. Cleanup
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Download failed:", error);
      alert(`Failed to download ${file.name}`);
    } finally {
      // 5. Remove loading state (stops spinner)
      setDownloadingPaths(prev => {
        const next = new Set(prev);
        next.delete(file.path);
        return next;
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Pass current state to the exporter
      await exportSnapshot(groups, gridCols, hue, apiUrl);
    } catch (e) {
      console.error(e);
      alert("Export failed!");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--neon-blue', `hsl(${hue}, 100%, 50%)`);
  }, [hue]);

  useEffect(() => {
    console.log("Attempting to fetch from:", `${apiUrl}/state`);
    axios.get(`${apiUrl}/state`)
      .then(res => {
        // Only overwrite default if the backend has valid groups
        if (res.data && res.data.groups && res.data.groups.length > 0) {
          setGroups(res.data.groups);
          setGridCols(res.data.config.gridCols);
          setHue(res.data.config.hue);
        }
      })
      .catch(() => {
        // If error (e.g., 404 or backend restart), we do nothing.
        // This keeps the default "Group 1" state active.
        console.log("Session not found, using default state.");
      })
      .finally(() => {
        // CRITICAL: We mark as loaded regardless of success/fail.
        // This allows the "Save" effect below to start running.
        setIsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!isLoaded) return; // Don't save until the load attempt finishes

    const timer = setTimeout(() => {
      axios.post(`${apiUrl}/state`, {
        groups: groups,
        config: { gridCols, hue }
      }).catch(e => console.error("Auto-save failed (Backend might be offline)"));
    }, 1000); // 1-second debounce to reduce network traffic

    return () => clearTimeout(timer);
  }, [groups, gridCols, hue, isLoaded]);

  const fetchDir = async (path) => {
    try {
      const res = await axios.get(`${apiUrl}/navigate`, { params: { path } });
      setFileList(res.data.items);
      setCurrentPath(res.data.path);
      setPathInput(res.data.path);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchDir('.'); }, []);

  const handleNavigate = (path) => fetchDir(path);
  const handleUpDir = () => {
    const parentPath = getParentPath(currentPath);
    handleNavigate(parentPath);
  };

  const handleDragStart = (e, file) => {
    e.dataTransfer.setData("file", JSON.stringify(file));
    console.log("🟢 DRAG STARTED:", file.name);
  }

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy"; // Makes the cursor look like a "plus" sign
    console.log("on Drag");
  };

  const handleDrop = async (e, groupId) => {
    e.preventDefault();
    try {
      const data = e.dataTransfer.getData("file");
      if (!data) return;
      const fileData = JSON.parse(data);
      setGroups(prev => prev.map(g => {
        if (g.id === groupId && !g.files.some(f => f.path === fileData.path)) {
          return { ...g, files: [...g.files, fileData] };
        }
        return g;
      }));
    } catch (error) { console.error("Drop error:", error); }
    console.log("🔴 DROP FIRED on Group:", groupId);
  };

  const getParentPath = (absolutePath) => {
    const normalized = absolutePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    parts.pop();
    let parentPath = parts.join('/');
    if (parentPath === '') {
      return '/';
    }
    if (parentPath.match(/^[a-zA-Z]:$/)) {
      parentPath += '/';
    }
    return parentPath;
  };

  const refreshGroup = (groupId) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        // Updating this key forces React to destroy and recreate the components
        return { ...g, refreshKey: Date.now() };
      }
      return g;
    }));
  };

  const addGroup = () => setGroups([...groups, { id: Date.now(), files: [] }]);
  const removeGroup = (id) => { if (groups.length > 1) setGroups(groups.filter(g => g.id !== id)); };
  const removeFileFromGroup = (groupId, filePath) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) return { ...g, files: g.files.filter(f => f.path !== filePath) };
      return g;
    }));
  };
  const scrollToRef = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="h-screen w-screen flex flex-col text-gray-200 overflow-hidden relative">
      <DockedSettings
        gridCols={gridCols} setGridCols={setGridCols}
        hue={hue} setHue={setHue}
        port={port} setPort={setPort}
      />

      <header className="h-14 border-b border-[#1f2933] flex items-center px-4 justify-between bg-[#050505] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧞</span>
          <h1 className="text-xl font-bold tracking-wider text-white">
            VISUAL <span style={{ color: 'var(--neon-blue)' }}>GENIE</span>
          </h1>
        </div>

        {/* <button 
         onClick={handleExport} 
         disabled={isExporting}
         className="px-3 py-1 text-xs font-bold uppercase tracking-widest bg-gray-900 border border-gray-700 text-gray-300 hover:bg-white hover:text-black transition-all rounded flex items-center gap-2 disabled:opacity-50"
        >
          {isExporting ? <div className="animate-spin w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full"/> : <Download size={14} />}
          {isExporting ? "Zipping..." : "Export"}
        </button>
        
        <button onClick={addGroup} className="px-4 py-1 text-xs font-bold uppercase tracking-widest bg-transparent border border-[var(--neon-blue)] text-[var(--neon-blue)] hover:bg-[var(--neon-blue)] hover:text-black transition-all rounded">
          + Split View
        </button> */}

        <div className="flex gap-2 items-center">
          {/* <button
            onClick={handleExport}
            disabled={isExporting}
            // APPLIED NEON THEME & CONSISTENT PADDING (px-4)
            className={`px-4 py-1 text-xs font-bold uppercase tracking-widest bg-transparent border border-[var(--neon-blue)] text-[var(--neon-blue)] hover:bg-[var(--neon-blue)] hover:text-black transition-all rounded flex items-center gap-2 disabled:opacity-50`}
          >
            {isExporting ? <div className="animate-spin w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full" /> : <Download size={14} />}
            {isExporting ? "Zipping..." : "Export"}
          </button> */}

          <button onClick={addGroup} className="px-4 py-1 text-xs font-bold uppercase tracking-widest bg-transparent border border-[var(--neon-blue)] text-[var(--neon-blue)] hover:bg-[var(--neon-blue)] hover:text-black transition-all rounded">
            + Split View
          </button>
        </div>

      </header>

      <div className="flex-1 flex overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={20} minSize={15} maxSize={40} className="glass-panel border-r border-[#1f2933] flex flex-col">
            <div className="p-3 border-b border-[#1f2933] flex gap-2 items-center">
              <button onClick={handleUpDir} className="hover:text-[var(--neon-blue)] transition-colors"><ChevronLeft size={20} /></button>
              <input className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-sm text-gray-300 focus:border-[var(--neon-blue)] outline-none transition-colors font-mono" value={pathInput} onChange={(e) => setPathInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNavigate(pathInput)} />
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {fileList.map((file, i) => (
                <div key={i} draggable onDragStart={(e) => handleDragStart(e, file)} onClick={() => file.is_dir && handleNavigate(file.path)} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-all hover:bg-[#1a232e] group select-none ${file.is_dir ? 'text-white font-medium' : 'text-gray-400'}`}>
                  <FileIcon isDir={file.is_dir} ext={file.extension} />
                  <span className="text-sm truncate group-hover:text-[var(--neon-blue)]">{file.name}</span>
                </div>
              ))}
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-[#1f2933] hover:bg-[var(--neon-blue)] transition-colors cursor-col-resize" />

          <Panel>
            <div className="h-full w-full flex bg-[#0a0a0a]">
              {groups.map((group, index) => (
                <div key={group.id}
                  className={`flex-1 flex flex-col relative min-w-0 ${index !== groups.length - 1 ? 'border-r border-[#1f2933]' : ''}`}
                  onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, group.id)}>

                  {/* === UPDATED GROUP HEADER === */}
                  <div className="h-9 bg-[#111] flex items-center justify-between px-3 border-b border-[#333] shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">Group {index + 1}</span>

                      {/* THE NEW REFRESH BUTTON */}
                      <button
                        onClick={() => refreshGroup(group.id)}
                        className="text-gray-600 hover:text-[var(--neon-blue)] transition-colors"
                        title="Refresh content"
                      >
                        <RotateCw size={14} />
                      </button>
                    </div>
                    <button onClick={() => removeGroup(group.id)} className="text-gray-600 hover:text-red-500 transition-colors"><X size={14} /></button>
                  </div>

                  {group.files.length > 0 && (
                    <div className="bg-[#0d1117] border-b border-[#1f2933] p-2 flex flex-wrap gap-2 shrink-0 max-h-24 overflow-y-auto">


                      {group.files.map((file, idx) => (
                        <div key={idx} className={`flex items-center gap-2 px-2 py-1 rounded text-xs border transition-all cursor-pointer group-tag ${file.is_dir ? 'bg-[#1a1500] border-orange-900/50 text-orange-200' : 'bg-[#1a232e] border-[#333] text-gray-300'}`}>
                          <FileIcon isDir={file.is_dir} ext={file.extension} size={12} />
                          <span onClick={() => scrollToRef(`file-${group.id}-${idx}`)} className="truncate max-w-[150px]">{file.name}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeFileFromGroup(group.id, file.path); }} className="hover:text-red-400 opacity-60 hover:opacity-100"><X size={10} /></button>
                        </div>
                      ))}


                    </div>
                  )}

                  <div
                    className="flex-1 overflow-y-auto p-4 bg-[#050505] grid gap-6 content-start pb-24"
                    style={{
                      gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                      gridAutoRows: 'max-content'
                    }}
                  >
                    {group.files.length === 0 ? (
                      <div className="h-full col-span-full flex flex-col items-center justify-center text-gray-700 select-none">
                        <Layout size={48} className="mb-2 opacity-20" />
                        <p className="text-sm">Drag files here</p>
                      </div>
                    ) : (
                      group.files.map((file, fIdx) => (
                        <div
                          id={`file-${group.id}-${fIdx}`}
                          key={`${fIdx}-${group.refreshKey}`}
                          className={`bg-[#0f1216] rounded-lg border border-[#1f2933] overflow-hidden flex flex-col relative shadow-lg h-auto w-full ${file.is_dir ? 'col-span-full' : 'col-span-1'}`}
                        >
                          <div className="flex justify-between items-center bg-[#1a2029] px-3 py-2 border-b border-[#1f2933]">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileIcon isDir={file.is_dir} ext={file.extension} />
                              <span className={`text-xs font-mono truncate ${file.is_dir ? 'text-orange-300 font-bold' : 'text-gray-300'}`}>{file.name}</span>
                            </div>


                            <div className="flex items-center gap-3">
                              {/* === NEW DOWNLOAD BUTTON === */}
                              {/* Only show for files, not folders */}
                              {!file.is_dir && (
                                <a
                                  href={`${apiUrl}/file?path=${encodeURIComponent(file.path)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download // Hint to browser to download instead of open
                                  className="text-gray-500 hover:text-[var(--neon-blue)] transition-colors flex items-center"
                                  title="Download File"
                                >
                                  <Download size={14} />
                                </a>
                              )}

                              {/* Existing Close Button */}
                              <button onClick={() => removeFileFromGroup(group.id, file.path)} className="hover:text-red-400 text-gray-500 transition-colors flex items-center">
                                <X size={14} />
                              </button>
                            </div>

                          </div>

                          <div className={`relative bg-[#050505] ${file.is_dir ? 'h-auto' : 'h-auto'}`}>
                            <VisualizerFactory
                              file={file}
                              gridCols={gridCols}
                              refreshKey={group.refreshKey}
                              apiUrl={apiUrl}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}