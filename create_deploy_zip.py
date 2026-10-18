import os
import zipfile

source_zip = 'hostinger_deploy.zip'
if os.path.exists(source_zip):
    os.remove(source_zip)

include_dirs = ['app', 'components', 'hooks', 'lib', 'public']
include_files = [
    'package.json',
    'yarn.lock',
    'next.config.js',
    'postcss.config.js',
    'tailwind.config.js',
    'jsconfig.json',
    'components.json'
]

os.makedirs('public', exist_ok=True)

with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for f in include_files:
        if os.path.exists(f):
            zipinfo = zipfile.ZipInfo(f)
            zipinfo.create_system = 3  # Unix
            zipinfo.external_attr = (0o100000 | 0o644) << 16
            with open(f, 'rb') as fp:
                zipf.writestr(zipinfo, fp.read())

    for d in include_dirs:
        if os.path.exists(d):
            top_info = zipfile.ZipInfo(d + '/')
            top_info.create_system = 3
            top_info.external_attr = (0o040000 | 0o755) << 16
            zipf.writestr(top_info, '')

            for root, dirs, files in os.walk(d):
                for sub_d in dirs:
                    dir_path = os.path.join(root, sub_d)
                    arcname = dir_path.replace('\\', '/') + '/'
                    zipinfo = zipfile.ZipInfo(arcname)
                    zipinfo.create_system = 3  # Unix
                    zipinfo.external_attr = (0o040000 | 0o755) << 16
                    zipf.writestr(zipinfo, '')
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = file_path.replace('\\', '/')
                    zipinfo = zipfile.ZipInfo(arcname)
                    zipinfo.create_system = 3  # Unix
                    zipinfo.external_attr = (0o100000 | 0o644) << 16
                    with open(file_path, 'rb') as fp:
                        zipf.writestr(zipinfo, fp.read())

sz = os.path.getsize(source_zip)
print(f'Successfully created {source_zip} ({sz} bytes, {sz/1024:.2f} KB)')
