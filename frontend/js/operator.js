document.addEventListener('DOMContentLoaded', async () => {
    try {
        const {
            data: { session },
            error: sessionError
        } = await supabaseClient.auth.getSession();

        if (sessionError || !session || !session.user) {
            window.location.href = 'login.html';
            return;
        }

        const userEmail = session.user.email;
        const { data: station, error: stationError } = await supabaseClient
            .from('stations')
            .select('*')
            .eq('email', userEmail)
            .single();

        if (stationError || !station) {
            console.error('Station fetch error:', stationError);
            alert('Unable to load station data for this operator.');
            return;
        }

        const stationName = station.name || 'Unnamed Station';
        const totalCapacity = Number(station.total_capacity_kw || 0);
        const totalPlugs = Number(station.num_plugs || 0);

        document.getElementById('sidebar-station-name').textContent = stationName;
        document.getElementById('max-capacity').textContent = String(totalCapacity);
        document.getElementById('total-plugs').textContent = String(totalPlugs);

        const ctx = document.getElementById('loadChart');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Current Load',
                        data: [],
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.18)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 1.5
                    },
                    {
                        label: 'ML Prediction',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.14)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 1.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e5e7eb'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(156, 163, 175, 0.12)' }
                    },
                    y: {
                        min: 0,
                        max: totalCapacity + 20,
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(156, 163, 175, 0.12)' }
                    }
                }
            }
        });

        const currentLoadEl = document.getElementById('current-load');
        const predictedLoadEl = document.getElementById('predicted-load');
        const activeSessionsEl = document.getElementById('active-sessions');
        const mlAlertEl = document.getElementById('ml-alert-banner');

        const maxPoints = 16;

        const pushPoint = (label, currentLoad, predictedLoad) => {
            chart.data.labels.push(label);
            chart.data.datasets[0].data.push(currentLoad);
            chart.data.datasets[1].data.push(predictedLoad);

            if (chart.data.labels.length > maxPoints) {
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
                chart.data.datasets[1].data.shift();
            }
            chart.update();
        };

        const tick = () => {
            const capacity = Math.max(totalCapacity, 1);
            const currentLoad = Number((Math.random() * (capacity * 0.95)).toFixed(1));
            const predictionDelta = (Math.random() * 20) - 4;
            const predictedLoad = Number(Math.max(0, (currentLoad + predictionDelta)).toFixed(1));
            const activeSessions = Math.max(0, Math.min(totalPlugs, Math.floor(Math.random() * (totalPlugs + 1))));

            currentLoadEl.textContent = `${currentLoad} kW`;
            predictedLoadEl.textContent = `${predictedLoad} kW`;
            activeSessionsEl.textContent = String(activeSessions);

            if (predictedLoad > 50) {
                mlAlertEl.style.display = 'block';
                predictedLoadEl.style.color = '#ef4444';
            } else {
                mlAlertEl.style.display = 'none';
                predictedLoadEl.style.color = '';
            }

            const now = new Date();
            const label = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            pushPoint(label, currentLoad, predictedLoad);
        };

        tick();
        setInterval(tick, 3000);
    } catch (err) {
        console.error('Operator dashboard init error:', err);
        window.location.href = 'login.html';
    }
});