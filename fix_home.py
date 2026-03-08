import pathlib

content = pathlib.Path('/Users/gaurangbhatia/Desktop/new_project/client/src/pages/Home.tsx').read_text()
lines = content.split('\n')

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "{/* HERO MOCKUPS (RIGHT) */}" in line:
        start_idx = i
        break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if "</main>" in lines[i]:
            end_idx = i - 2
            break

if start_idx != -1 and end_idx != -1:
    replacement = """                        {/* HERO MOCKUPS (RIGHT) */}
                        <div className="relative z-10 w-full h-[350px] sm:h-[450px] lg:h-[600px] flex items-center justify-center mt-12 lg:mt-0 pointer-events-none perspective-[2000px]">
                            <div className="relative w-full h-full max-w-[800px] mx-auto flex items-center justify-center">
                                
                                {/* Laptop Dashboard */}
                                <motion.div
                                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute left-1/2 -translate-x-1/2 top-[5%] md:top-[10%] w-[95%] md:w-[120%] lg:w-[140%] max-w-[1000px] rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] overflow-hidden border border-neutral-200/50 z-10 bg-white"
                                >
                                    <div className="w-full h-6 sm:h-8 bg-slate-100 border-b border-neutral-200 items-center px-4 gap-1.5 hidden sm:flex">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                                    </div>
                                    <img src="/dashboard-laptop.png" alt="MathLogs Dashboard on Laptop" className="w-full h-auto object-cover" />
                                </motion.div>

                                {/* Tablet Dashboard */}
                                <motion.div
                                    initial={{ opacity: 0, x: -40, y: 20 }}
                                    animate={{ opacity: 1, x: 0, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute left-[-2%] sm:left-[-15%] lg:left-[-25%] top-[15%] sm:top-[20%] w-[45%] sm:w-[40%] rounded-lg sm:rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] overflow-hidden border-[4px] sm:border-[8px] border-slate-900 z-20 bg-white"
                                >
                                    <img src="/dashboard-tablet.png" alt="MathLogs Dashboard on Tablet" className="w-full h-auto object-cover" />
                                </motion.div>

                                {/* Mobile Dashboard */}
                                <motion.div
                                    initial={{ opacity: 0, x: 40, y: 40 }}
                                    animate={{ opacity: 1, x: 0, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute right-[-2%] sm:right-[-10%] lg:right-[-15%] bottom-[-5%] sm:bottom-[-2%] w-[28%] sm:w-[25%] rounded-[1.2rem] sm:rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] overflow-hidden border-[5px] sm:border-[10px] border-slate-900 z-30 bg-white"
                                >
                                    <img src="/dashboard-mobile.png" alt="MathLogs Dashboard on Mobile" className="w-full h-auto object-cover" />
                                </motion.div>

                            </div>
                        </div>"""
    
    new_lines = lines[:start_idx] + [replacement] + lines[end_idx+1:]
    pathlib.Path('/Users/gaurangbhatia/Desktop/new_project/client/src/pages/Home.tsx').write_text('\n'.join(new_lines))
    print("Replaced successfully")
else:
    print("Could not find start or end")
