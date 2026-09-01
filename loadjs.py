import re, json

def strip_comments_and_extract(src, start_marker):
    idx = src.find(start_marker)
    idx = src.find('{', idx)
    depth = 0
    i = idx
    in_str = False
    esc = False
    strch = ''
    out = []
    while i < len(src):
        c = src[i]
        if in_str:
            out.append(c)
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == strch:
                in_str = False
            i += 1
            continue
        if c == '/' and i + 1 < len(src) and src[i+1] == '/':
            j = src.find('\n', i)
            if j == -1:
                j = len(src)
            out.append('\n')
            i = j + 1
            continue
        if c == '"' or c == "'":
            in_str = True
            strch = c
            out.append('"' if c == "'" else c)
            i += 1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        out.append(c)
        i += 1
        if depth == 0 and c == '}':
            break
    return ''.join(out)

def load(path, varname):
    with open(path, encoding='utf-8') as f:
        src = f.read()
    txt = strip_comments_and_extract(src, varname)
    txt = txt.replace('WIKI_POLL_URL', '"WIKI_POLL_URL"')
    return json.loads(txt)
