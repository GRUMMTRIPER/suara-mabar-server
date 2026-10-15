const http = require("http");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const MAKS_PEMAIN = 5;
const ruang = new Map();

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
        nama: "Suara Mabar",
        status: "Server aktif",
        jumlahRuang: ruang.size
    }));
});

const wss = new WebSocket.Server({ server });

function kirim(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function buatKode() {
    const karakter = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (let percobaan = 0; percobaan < 20; percobaan++) {
        let kode = "";

        for (let i = 0; i < 6; i++) {
            kode += karakter[
                crypto.randomInt(karakter.length)
            ];
        }

        if (!ruang.has(kode)) return kode;
    }

    throw new Error("Tidak bisa membuat kode ruang");
}

function siarkanAnggota(kode) {
    const dataRuang = ruang.get(kode);
    if (!dataRuang) return;

    const pesan = {
        tipe: "anggota",
        jumlah: dataRuang.pemain.size,
        maksimal: MAKS_PEMAIN
    };

    for (const pemain of dataRuang.pemain) {
        kirim(pemain, pesan);
    }
}

function keluarkan(socket) {
    const kode = socket.kodeRuang;
    if (!kode) return;

    const dataRuang = ruang.get(kode);
    socket.kodeRuang = null;

    if (!dataRuang) return;

    dataRuang.pemain.delete(socket);

    for (const pemain of dataRuang.pemain) {
        kirim(pemain, {
            tipe: "pemain_keluar",
            pesan: "Seorang pemain meninggalkan ruang"
        });
    }

    if (dataRuang.pemain.size === 0) {
        ruang.delete(kode);
    } else {
        siarkanAnggota(kode);
    }
}

wss.on("connection", (socket) => {
    socket.kodeRuang = null;

    kirim(socket, {
        tipe: "terhubung",
        pesan: "Terhubung ke server Suara Mabar"
    });

    socket.on("message", (data) => {
        let pesan;

        try {
            if (data.length > 4096) {
                kirim(socket, {
                    tipe: "error",
                    pesan: "Pesan terlalu besar"
                });
                return;
            }

            pesan = JSON.parse(data.toString());
        } catch {
            kirim(socket, {
                tipe: "error",
                pesan: "Format pesan tidak valid"
            });
            return;
        }

        if (!pesan || typeof pesan.tipe !== "string") {
            kirim(socket, {
                tipe: "error",
                pesan: "Tipe permintaan tidak valid"
            });
            return;
        }

        if (pesan.tipe === "buat_ruang") {
            if (socket.kodeRuang) {
                kirim(socket, {
                    tipe: "error",
                    pesan: "Kamu sudah berada di ruang"
                });
                return;
            }

            const kode = buatKode();
            ruang.set(kode, {
                pemain: new Set([socket])
            });

            socket.kodeRuang = kode;

            kirim(socket, {
                tipe: "ruang_dibuat",
                kode: kode,
                jumlah: 1,
                maksimal: MAKS_PEMAIN
            });

            siarkanAnggota(kode);
            return;
        }

        if (pesan.tipe === "gabung_ruang") {
            if (socket.kodeRuang) {
                kirim(socket, {
                    tipe: "error",
                    pesan: "Keluar dari ruang sebelumnya dahulu"
                });
                return;
            }

            if (typeof pesan.kode !== "string") {
                kirim(socket, {
                    tipe: "error",
                    pesan: "Kode ruang tidak valid"
                });
                return;
            }

            const kode = pesan.kode.trim().toUpperCase();
            const dataRuang = ruang.get(kode);

            if (!dataRuang) {
                kirim(socket, {
                    tipe: "error",
                    pesan: "Ruang tidak ditemukan atau sudah ditutup"
                });
                return;
            }

            if (dataRuang.pemain.size >= MAKS_PEMAIN) {
                kirim(socket, {
                    tipe: "error",
                    pesan: "Ruang sudah penuh"
                });
                return;
            }

            dataRuang.pemain.add(socket);
            socket.kodeRuang = kode;

            kirim(socket, {
                tipe: "berhasil_gabung",
                kode: kode,
                jumlah: dataRuang.pemain.size,
                maksimal: MAKS_PEMAIN
            });

            for (const pemain of dataRuang.pemain) {
                if (pemain !== socket) {
                    kirim(pemain, {
                        tipe: "pemain_baru",
                        pesan: "Pemain baru bergabung"
                    });
                }
            }

            siarkanAnggota(kode);
            return;
        }

        if (pesan.tipe === "keluar_ruang") {
            keluarkan(socket);
            kirim(socket, {
                tipe: "berhasil_keluar",
                pesan: "Kamu keluar dari ruang"
            });
            return;
        }

        kirim(socket, {
            tipe: "error",
            pesan: "Permintaan belum didukung"
        });
    });

    socket.on("close", () => {
        keluarkan(socket);
    });

    socket.on("error", () => {
        keluarkan(socket);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Server Suara Mabar berjalan di port " + PORT);
});
