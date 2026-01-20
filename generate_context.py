import os

# ================= CONFIGURATION =================
TARGET_FOLDER = "." 
OUTPUT_FILE = "full_project_context.txt"

# REMOVED '.env' for security. 
# Added '.jsx' and '.vue' just in case.
EXTENSIONS = {'.py', '.tsx', '.ts', '.css', '.sql', '.json', '.js', '.jsx', '.html'} 

# Folders to ignore
IGNORE_DIRS = {'node_modules', 'venv', '.git', '__pycache__', 'dist', 'build', '.idea', '.vscode', '.next'}

# Specific files to ignore (Noise reduction)
IGNORE_FILES = {'package-lock.json', 'yarn.lock', 'full_project_context.txt', 'generate_context.py', '.DS_Store', 'docker-compose.yml', 'generate_full_data.py'}
# =================================================

def generate_tree(startpath, outfile):
    outfile.write("PROJECT DIRECTORY TREE:\n")
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        outfile.write(f"{indent}{os.path.basename(root)}/\n")
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            if f not in IGNORE_FILES and any(f.endswith(ext) for ext in EXTENSIONS):
                outfile.write(f"{subindent}{f}\n")
    outfile.write("\n" + "="*50 + "\n\n")

def scan_folder():
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        outfile.write(f"PROJECT CONTEXT DUMP\n")
        outfile.write(f"App: Inventory Manager Project\n")
        outfile.write("="*50 + "\n\n")

        # 1. Generate the Tree Structure first
        generate_tree(TARGET_FOLDER, outfile)

        # 2. Dump the File Contents
        for root, dirs, files in os.walk(TARGET_FOLDER):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            
            for file in files:
                # Skip ignored files
                if file in IGNORE_FILES:
                    continue

                if any(file.endswith(ext) for ext in EXTENSIONS):
                    path = os.path.join(root, file)
                    
                    print(f"Adding: {path}")
                    outfile.write(f"\n\n{'='*20}\nFILE: {path}\n{'='*20}\n\n")
                    
                    try:
                        with open(path, 'r', encoding='utf-8') as infile:
                            outfile.write(infile.read())
                    except Exception as e:
                        outfile.write(f"# Error reading file: {e}")

    print(f"\nDone! Upload '{OUTPUT_FILE}' to the chat.")

if __name__ == "__main__":
    scan_folder()