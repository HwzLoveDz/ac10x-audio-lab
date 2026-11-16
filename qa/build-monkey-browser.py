"""Build QA-only isolated HTML; never replace the production bundle."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
source=(root/'AC10x-Audio-Lab.html').read_bytes().decode('utf8')
guard=(root/'qa/browser-isolation.js').read_text(encoding='utf8')
probe=(root/'qa/browser-probe.js').read_text(encoding='utf8')
assert '<head>' in source and '</body>' in source
result=source.replace('<head>','<head><script>'+guard+'</script>',1).replace('</body>','<script>'+probe+'</script></body>',1)
(root/'monkey-isolated.html').write_bytes(result.encode('utf8'))
print(json.dumps({'sourceSHA256':hashlib.sha256(source.encode()).hexdigest(),'isolatedSHA256':hashlib.sha256(result.encode()).hexdigest(),'testOnly':True}))
