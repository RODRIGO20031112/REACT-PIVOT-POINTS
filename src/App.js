import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import axios from 'axios';
import './App.css';

function App() {
  const chartContainerRef = useRef(null);

  const calcularMME = (candles, periodo = 20) => {
    const fechamentos = candles.map(candle => parseFloat(candle[4]));

    if (fechamentos.length < periodo) {
        console.error("Erro: Não há candles suficientes para calcular a MME.");
        return [];
    }

    const multiplicador = 2 / (periodo + 1);
    let mme = [fechamentos.slice(0, periodo).reduce((acc, valor) => acc + valor, 0) / periodo];

    for (let i = periodo; i < fechamentos.length; i++) {
        const novoMME = (fechamentos[i] - mme[mme.length - 1]) * multiplicador + mme[mme.length - 1];
        mme.push(novoMME);
    }

    return mme;
  }

  useEffect(() => {
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: 'transparent',
        },
        textColor: '#ffffff',
      },
      grid: {
        vertLines: {
          color: 'transparent',
        },
        horzLines: {
          color: 'transparent',
        },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          visible: false,
        },
        horzLine: {
          visible: false, 
        },
      },
      tooltip: {
        enabled: false, 
      },
      priceScale: {
        borderColor: "transparent",
      },
      timeScale: {
        borderColor: 'transparent',
        timeVisible: true,
        secondsVisible: true,
      },
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        visible: true,
        borderColor: 'transparent',
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      lastValueVisible: false, 
      priceLineVisible: false, 
    });

    const fetchCandles = async (symbol, startTime, endTime) => {
      const url = 'https://fapi.binance.com/fapi/v1/klines';
      let params;

      try {
        params = {
          symbol: symbol,
          startTime: startTime,
          endTime: endTime,
          interval: "5m",
          limit: 1000,
        };

        const response_5m = await axios.get(url, { params });
        const data_5m = response_5m.data;

        const formattedData = data_5m.map(candle => ({
          time: new Date(candle[0]).getTime() / 1000,
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
        }));

        const closes = formattedData.map(candle => candle.close);
        const maxClose = Math.max(...closes);
        const minClose = Math.min(...closes);

        candleSeries.setData(formattedData);

        params = {
          symbol: symbol,
          startTime: startTime - (24 * 60 * 60 * 1000),
          endTime: endTime,
          interval: "1d",
          limit: 1,
        };

        const response_1d = await axios.get(url, { params });
        const data_1d = response_1d.data;

        const candle_1d = data_1d[0];
        const high = parseFloat(candle_1d[2]);
        const low = parseFloat(candle_1d[3]);
        const close = parseFloat(candle_1d[4]);

        const pp = (high + low + close) / 3;
        const r1 = 2 * pp - low;
        const s1 = 2 * pp - high;
        const r2 = pp + (high - low);
        const s2 = pp - (high - low);
        const r3 = high + 2 * (pp - low);
        const s3 = low - 2 * (high - pp);

        const pivots = [pp, r1, s1, r2, s2, r3, s3];
        let maxPivot = Math.max(...pivots);
        let minPivot = Math.min(...pivots);

        let prevR1 = r3;
        let prevR2 = r2;
        let prevS1 = s3;
        let prevS2 = s2;

        while (maxClose >= maxPivot) {
          const nextResistance = prevR1 + (prevR1 - prevR2);
          pivots.push(nextResistance);
          prevR2 = prevR1;
          prevR1 = nextResistance;
          maxPivot = Math.max(maxPivot, nextResistance);
          if (maxClose < maxPivot) break;
          const nextSupport = prevS1 - (prevS2 - prevS1);
          pivots.push(nextSupport);
          prevS2 = prevS1;
          prevS1 = nextSupport;
          minPivot = Math.min(minPivot, nextSupport);
        }

        while (minClose <= minPivot) {
          const nextSupport = prevS1 - (prevS2 - prevS1);
          pivots.push(nextSupport);
          prevS2 = prevS1;
          prevS1 = nextSupport;
          minPivot = Math.min(minPivot, nextSupport);
        }

        pivots.forEach((pivot, index) => {
          const lineSeries = chart.addLineSeries({
            color: 'white',
            lineWidth: 2,
            priceLineStyle: LineStyle.Solid,
          });

          lineSeries.setData([
            { time: formattedData[formattedData.length - 1].time, value: pivot },
          ]);
        });

        const mme = calcularMME(data_5m);
        if (mme.length === 0) throw new Error("Erro: Falha no cálculo da MME.");

        const upperLimitSeries = chart.addLineSeries({
          color: 'green',
          lineWidth: 0,
          priceLineStyle: LineStyle.Solid,
          priceLineVisible: false,
          crosshairMarkerVisible: false, 
          lastValueVisible: false,
        });
        
        const lowerLimitSeries = chart.addLineSeries({
          color: 'red',
          lineWidth: 0,
          priceLineStyle: LineStyle.Solid,
          priceLineVisible: false,
          crosshairMarkerVisible: false, 
          lastValueVisible: false,
        });

        const mmeData = mme.map((valor, index) => ({
          x: formattedData[index + 19].x, 
          y: valor
        }));

        upperLimitSeries.setData(mmeData.map((data, index) => ({
          time: formattedData[index + 19].time,
          value: data.y * 1.02
        })));
  
        lowerLimitSeries.setData(mmeData.map((data, index) => ({
          time: formattedData[index + 19].time,
          value: data.y * 0.98
        })));

      } catch (error) {
        console.error('Error fetching candles', error);
      }
    };

    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startTime = startOfDay.getTime();
    const endTime = startTime + 24 * 60 * 60 * 1000;
    fetchCandles("BTCUSDT", startTime, endTime);

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  return (
    <div
      ref={chartContainerRef}
        style={{
          width: '100%',
          height: 'calc(100vh - 16px)',
          backgroundColor: 'transparent',        
      }}
    />
  );
}

export default App;
