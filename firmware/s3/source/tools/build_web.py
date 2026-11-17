"""Produce a standalone offline WebHID page without modifying parent UI."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
html = (root/'web/index.template.html').read_text(encoding='utf-8')
for marker, name in [('TRANSPORT_INLINE', 'transport.js'), ('APP_INLINE', 'app.js')]:
    code = (root/'web'/name).read_text(encoding='utf-8')
    assert '</script' not in code.lower()
    html = html.replace(f'<!-- {marker} -->', '<script>\n' + code + '\n</script>')
(root/'web/AC10x-S3-Bridge-v0.3.0.html').write_text(html, encoding='utf-8')
print('Built standalone S3 diagnostic WebTool; no hardware opened.')
