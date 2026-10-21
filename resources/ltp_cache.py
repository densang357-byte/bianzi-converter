"""Bounded local analysis cache. Cache failures must never block conversion."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import time
import zlib


class AnalysisCache:
    def __init__(self, path, namespace, max_bytes=128 * 1024 * 1024, max_entries=50000):
        self.connection = None
        self.namespace = namespace
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        try:
            path = Path(path)
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            self.connection = sqlite3.connect(path, timeout=2, check_same_thread=False)
            path.chmod(0o600)
            self.connection.execute('CREATE TABLE IF NOT EXISTS analyses (namespace TEXT, key TEXT, value BLOB, used REAL, PRIMARY KEY(namespace,key))')
            self.connection.execute('CREATE INDEX IF NOT EXISTS analyses_used ON analyses(used)')
            self.connection.commit()
        except (OSError, sqlite3.Error) as error:
            self._disable(error)

    def _disable(self, error):
        print(f'LTP disk cache unavailable; using memory cache: {error}', file=sys.stderr)
        self.close()

    @staticmethod
    def key(sentence):
        return hashlib.sha256(sentence.encode('utf-8')).hexdigest()

    def get(self, sentence):
        if self.connection is None:
            return None
        try:
            key = self.key(sentence)
            row = self.connection.execute('SELECT value FROM analyses WHERE namespace=? AND key=?', (self.namespace, key)).fetchone()
            if not row:
                return None
            value = json.loads(zlib.decompress(row[0]))
            if value.get('text') != sentence or not isinstance(value.get('words'), list):
                raise ValueError('invalid analysis cache record')
            self.connection.execute('UPDATE analyses SET used=? WHERE namespace=? AND key=?', (time.time(), self.namespace, key))
            return value
        except (ValueError, zlib.error, TypeError, AttributeError):
            # A damaged row is a miss; inference will replace it.
            return None
        except sqlite3.Error as error:
            self._disable(error)
            return None

    def put(self, sentence, value):
        if self.connection is None:
            return
        try:
            blob = zlib.compress(json.dumps(value, ensure_ascii=False).encode('utf-8'), 1)
            self.connection.execute('INSERT OR REPLACE INTO analyses VALUES (?,?,?,?)',
                                    (self.namespace, self.key(sentence), blob, time.time()))
        except sqlite3.Error as error:
            self._disable(error)

    def flush(self):
        if self.connection is None:
            return
        try:
            # Bounds apply across model versions. Deleted SQLite pages are reused.
            count, size = self.connection.execute('SELECT COUNT(*), COALESCE(SUM(LENGTH(value)),0) FROM analyses').fetchone()
            if count > self.max_entries or size > self.max_bytes:
                for rowid, length in self.connection.execute('SELECT rowid,LENGTH(value) FROM analyses ORDER BY used').fetchall():
                    if count <= self.max_entries and size <= self.max_bytes:
                        break
                    self.connection.execute('DELETE FROM analyses WHERE rowid=?', (rowid,))
                    count -= 1
                    size -= length
            self.connection.commit()
        except sqlite3.Error as error:
            self._disable(error)

    def close(self):
        if self.connection is not None:
            try:
                self.connection.close()
            except sqlite3.Error:
                pass
            self.connection = None
